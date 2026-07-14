/**
 * Live Enrichr library catalog.
 *
 * Enrichr adds, renames, and retires libraries continuously. Hardcoding the
 * list means `suggest_libraries` eventually recommends libraries the API no
 * longer serves (a dead library returns `{}`, not an error), so the catalog is
 * fetched from Enrichr and the curated text in `library_descriptions.ts` is
 * applied on top as an overlay.
 */

import { libraryDescriptions, libraryToCategory } from "./library_descriptions.js";

const ENRICHR_URL = "https://maayanlab.cloud/Enrichr";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 15_000;

export interface CatalogEntry {
  library: string;
  category: string;
  description: string;
  /** Gene sets in the library, per Enrichr's statistics endpoint. */
  termCount: number;
}

export interface Catalog {
  entries: Map<string, CatalogEntry>;
  /** False when Enrichr was unreachable and we fell back to the bundled list. */
  live: boolean;
  fetchedAt: number;
}

let cached: Catalog | null = null;
let inFlight: Promise<Catalog> | null = null;

/**
 * Libraries we have curated text for but Enrichr no longer serves. Kept out of
 * every catalog view so they are never suggested; retained in
 * `library_descriptions.ts` so the text survives if Enrichr restores them.
 */
function buildFallbackCatalog(): Catalog {
  const entries = new Map<string, CatalogEntry>();
  for (const [library, description] of Object.entries(libraryDescriptions)) {
    entries.set(library, {
      library,
      category: libraryToCategory[library] ?? "other",
      description,
      termCount: 0,
    });
  }
  return { entries, live: false, fetchedAt: Date.now() };
}

/**
 * Derive a usable description for a live library we have no curated text for,
 * so new Enrichr releases are still discoverable via `suggest_libraries`
 * instead of being invisible until someone hand-writes a blurb.
 */
function synthesizeDescription(library: string): string {
  return library.replace(/_/g, " ");
}

async function fetchCatalog(): Promise<Catalog> {
  const response = await fetch(`${ENRICHR_URL}/datasetStatistics`, {
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    statistics?: Array<{ libraryName?: string; numTerms?: number }>;
  };

  if (!Array.isArray(data.statistics) || data.statistics.length === 0) {
    throw new Error("datasetStatistics returned no libraries");
  }

  const entries = new Map<string, CatalogEntry>();
  for (const stat of data.statistics) {
    const library = stat.libraryName;
    if (!library) continue;
    entries.set(library, {
      library,
      category: libraryToCategory[library] ?? "other",
      description: libraryDescriptions[library] ?? synthesizeDescription(library),
      termCount: stat.numTerms ?? 0,
    });
  }

  return { entries, live: true, fetchedAt: Date.now() };
}

/**
 * The live catalog, cached for {@link CATALOG_TTL_MS}. Never rejects: if
 * Enrichr is unreachable we fall back to the bundled descriptions so the server
 * still starts and answers, with `live: false` to mark the results as suspect.
 */
export async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return cached;
  }
  if (inFlight) return inFlight;

  inFlight = fetchCatalog()
    .then((catalog) => {
      cached = catalog;
      return catalog;
    })
    .catch((error) => {
      console.error(
        `Could not fetch the Enrichr library catalog (${
          error instanceof Error ? error.message : String(error)
        }); falling back to the bundled library list, which may be out of date.`
      );
      const fallback = buildFallbackCatalog();
      cached = fallback;
      return fallback;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Test seam: drop the cached catalog so the next `getCatalog()` refetches. */
export function resetCatalogCache(): void {
  cached = null;
  inFlight = null;
}

/** Test seam: install a catalog without touching the network. */
export function setCatalogForTesting(libraries: string[]): void {
  const entries = new Map<string, CatalogEntry>();
  for (const library of libraries) {
    entries.set(library, {
      library,
      category: libraryToCategory[library] ?? "other",
      description: libraryDescriptions[library] ?? synthesizeDescription(library),
      termCount: 0,
    });
  }
  cached = { entries, live: true, fetchedAt: Date.now() };
}
