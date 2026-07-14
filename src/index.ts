#!/usr/bin/env node

/**
 * MCP Server for Enrichr gene set enrichment analysis.
 * Provides multi-library enrichment analysis via the Enrichr API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { libraryDescriptions, LIBRARY_CATEGORIES, libraryToCategory } from "./library_descriptions.js";
import { getCatalog, type Catalog, type CatalogEntry } from "./enrichr_catalog.js";

// ---------------------------------------------------------------------------
// Version (read from package.json)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);
const VERSION: string = packageJson.version;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENRICHR_URL = "https://maayanlab.cloud/Enrichr";

/**
 * Background-corrected enrichment lives on a separate Enrichr service. The
 * classic /Enrichr endpoint has no way to supply a custom background.
 */
const SPEEDRICHR_URL = "https://maayanlab.cloud/speedrichr/api";

const FETCH_TIMEOUT_MS = 30_000;

/**
 * The background service returns sporadic 500s that clear on a retry, so retry
 * before demoting a result to uncorrected p-values.
 */
const BACKGROUND_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 750;

/** A background smaller than this cannot support a meaningful enrichment test. */
const MIN_BACKGROUND_GENES = 20;

const POPULAR_LIBRARIES = [
  "GO_Biological_Process_2026",
  "KEGG_2026",
  "Reactome_Pathways_2024",
  "MSigDB_Hallmark_2020",
  "ChEA_2022",
  "GWAS_Catalog_2025",
  "Human_Phenotype_Ontology",
  "PPI_Hub_Proteins",
  "DGIdb_Drug_Targets_2024",
  "CellMarker_2024",
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type OutputFormat = "detailed" | "compact" | "minimal";

export interface ServerConfig {
  defaultLibraries: string[];
  maxTermsPerLibrary: number;
  format: OutputFormat;
  saveToFile: boolean;
  outputFile: string;
}

export function parseConfig(argv: string[] = process.argv.slice(2)): ServerConfig {
  const config: ServerConfig = {
    defaultLibraries: POPULAR_LIBRARIES,
    maxTermsPerLibrary: 50,
    format: "detailed",
    saveToFile: false,
    outputFile: "",
  };

  // Parse CLI arguments
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--libraries" || arg === "-l") {
      const val = argv[i + 1];
      if (val) {
        config.defaultLibraries =
          val.toLowerCase() === "pop"
            ? POPULAR_LIBRARIES
            : val.split(",").map((lib) => lib.trim());
        i++;
      }
    } else if (arg === "--max-terms" || arg === "-m") {
      const val = argv[i + 1];
      if (val) {
        const n = parseInt(val);
        if (!isNaN(n) && n > 0) config.maxTermsPerLibrary = n;
        i++;
      }
    } else if (arg === "--format" || arg === "-f") {
      const val = argv[i + 1];
      if (val && ["detailed", "compact", "minimal"].includes(val)) {
        config.format = val as OutputFormat;
        i++;
      }
    } else if (arg === "--output" || arg === "-o") {
      const val = argv[i + 1];
      if (val) {
        config.outputFile = val;
        config.saveToFile = true;
        i++;
      }
    } else if (arg === "--compact" || arg === "-c") {
      config.format = "compact";
    } else if (arg === "--minimal") {
      config.format = "minimal";
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Enrichr MCP Server v${VERSION}

Usage: enrichr-mcp-server [options]

Options:
  -l, --libraries <libs>    Comma-separated list of default Enrichr libraries.
                           Use "pop" for a curated list of popular libraries.
                           (default: pop)
  -m, --max-terms <num>    Maximum terms to show per library (default: 50)
  -f, --format <format>    Output format: detailed, compact, minimal (default: detailed)
  -o, --output <file>      Save complete results to TSV file
  -c, --compact            Use compact format (same as --format compact)
      --minimal            Use minimal format (same as --format minimal)
  -h, --help              Show this help message

Environment Variables:
  ENRICHR_LIBRARIES          Comma-separated list of default libraries
  ENRICHR_MAX_TERMS          Maximum terms per library
  ENRICHR_FORMAT             Output format (detailed/compact/minimal)
  ENRICHR_OUTPUT_FILE        TSV output file path
      `);
      process.exit(0);
    }
  }

  // Environment variable overrides
  if (process.env.ENRICHR_LIBRARIES) {
    config.defaultLibraries = process.env.ENRICHR_LIBRARIES.split(",").map(
      (lib) => lib.trim()
    );
  }
  if (process.env.ENRICHR_MAX_TERMS) {
    const n = parseInt(process.env.ENRICHR_MAX_TERMS);
    if (!isNaN(n) && n > 0) config.maxTermsPerLibrary = n;
  }
  if (process.env.ENRICHR_FORMAT) {
    const f = process.env.ENRICHR_FORMAT;
    if (["detailed", "compact", "minimal"].includes(f))
      config.format = f as OutputFormat;
  }
  if (process.env.ENRICHR_OUTPUT_FILE) {
    config.outputFile = process.env.ENRICHR_OUTPUT_FILE;
    config.saveToFile = true;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Enrichr types
// ---------------------------------------------------------------------------

/** Parsed Enrichr term — mapped from the positional tuple returned by the API */
export interface EnrichrTerm {
  rank: number;
  termName: string;
  pValue: number;
  /** Infinity when every background gene in the term is in the gene list. */
  oddsRatio: number | null;
  /** Infinity when the odds ratio is infinite. */
  combinedScore: number | null;
  overlappingGenes: string[];
  adjustedPValue: number;
}

export interface EnrichmentResult {
  totalTerms: number;
  significantTerms: number;
  terms: EnrichrTerm[];
  /**
   * True when the p-values were computed against a caller-supplied background.
   * False means the whole-genome default was used — including when a custom
   * background was requested but Enrichr could not honour it (see `warning`).
   */
  backgroundCorrected: boolean;
  /** Set when the result is not what the caller asked for. */
  warning?: string;
}

export interface EnrichmentError {
  error: string;
}

export type LibraryResults = Record<string, EnrichmentResult | EnrichmentError>;

/** Map a raw Enrichr tuple to a typed object */
function parseEnrichrTuple(tuple: any[]): EnrichrTerm {
  return {
    rank: tuple[0],
    termName: tuple[1],
    pValue: tuple[2],
    oddsRatio: tuple[3],
    combinedScore: tuple[4],
    overlappingGenes: tuple[5],
    adjustedPValue: tuple[6],
  };
}

/**
 * Parse an Enrichr response body.
 *
 * Enrichr emits bare `Infinity` / `NaN` literals for the odds ratio and
 * combined score — an infinite odds ratio just means every background gene in
 * the term is also in the gene list, which is routine with a small custom
 * background. Those literals are not legal JSON and `JSON.parse` rejects them,
 * so rewrite them into IEEE-equivalent numeric literals first: `1e999`
 * overflows to `Infinity`, which is exactly the value Enrichr meant.
 *
 * Only bare literals in value position are rewritten, so a term whose *name*
 * contains the word "Infinity" is left alone.
 */
export function parseEnrichrJson(body: string): any {
  const sanitized = body
    .replace(/(?<=[:,[]\s*)-Infinity(?=\s*[,\]}])/g, "-1e999")
    .replace(/(?<=[:,[]\s*)Infinity(?=\s*[,\]}])/g, "1e999")
    .replace(/(?<=[:,[]\s*)NaN(?=\s*[,\]}])/g, "null");

  return JSON.parse(sanitized);
}

/** Render a possibly non-finite Enrichr statistic. */
function formatStat(value: number | null, digits: number): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (value === Infinity) return "Inf";
  if (value === -Infinity) return "-Inf";
  return value.toFixed(digits);
}

/**
 * JSON has no way to represent Infinity or NaN, and Zod rejects them for
 * `z.number()` — so an infinite odds ratio (routine with a custom background,
 * where a term's every background gene can land in the gene list) would fail
 * MCP output validation and sink the whole tool call. Replace non-finite
 * statistics with null on the way out to the wire; the in-memory results keep
 * the true values, so the text and TSV output still render them as "Inf".
 */
function toJsonSafeResults(results: LibraryResults): LibraryResults {
  const safe = (v: number | null): number | null =>
    v === null || !Number.isFinite(v) ? null : v;

  return Object.fromEntries(
    Object.entries(results).map(([library, result]) => {
      if ("error" in result) return [library, result];
      return [
        library,
        {
          ...result,
          terms: result.terms.map((t) => ({
            ...t,
            oddsRatio: safe(t.oddsRatio),
            combinedScore: safe(t.combinedScore),
          })),
        },
      ];
    })
  );
}

// ---------------------------------------------------------------------------
// Enrichr API
// ---------------------------------------------------------------------------

/**
 * Submit a gene list. The classic and speedrichr services keep separate ID
 * namespaces, so a list must be submitted to whichever service will read it.
 */
async function submitGeneList(
  geneList: string[],
  description: string,
  baseUrl: string = ENRICHR_URL
): Promise<number> {
  const formData = new FormData();
  formData.append("list", geneList.join("\n"));
  formData.append("description", description);

  const response = await fetch(`${baseUrl}/addList`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  if (!data.userListId) {
    throw new Error(
      `'userListId' not found in Enrichr response: ${JSON.stringify(data)}`
    );
  }
  return data.userListId;
}

/** Register a custom background and return its ID. speedrichr only. */
async function submitBackground(background: string[]): Promise<string> {
  const formData = new FormData();
  formData.append("background", background.join("\n"));

  const response = await fetch(`${SPEEDRICHR_URL}/addbackground`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  if (!data.backgroundid) {
    throw new Error(
      `'backgroundid' not found in Enrichr response: ${JSON.stringify(data)}`
    );
  }
  return data.backgroundid;
}

/** Split an Enrichr term array into a typed result. */
function toResult(
  allResults: any[],
  backgroundCorrected: boolean,
  warning?: string
): EnrichmentResult {
  const significant = allResults
    .filter((r: any[]) => r[6] < 0.05)
    .map(parseEnrichrTuple);

  return {
    totalTerms: allResults.length,
    significantTerms: significant.length,
    terms: significant,
    backgroundCorrected,
    ...(warning ? { warning } : {}),
  };
}

async function fetchLibrary(
  userListId: number,
  library: string,
  warning?: string
): Promise<EnrichmentResult | EnrichmentError> {
  const params = new URLSearchParams({
    userListId: userListId.toString(),
    backgroundType: library,
  });

  const response = await fetch(`${ENRICHR_URL}/enrich?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { error: `HTTP ${response.status}: ${response.statusText}` };
  }

  const data = parseEnrichrJson(await response.text());

  // A retired or misspelled library is not an error to Enrichr — it silently
  // returns {}. Surface it rather than reporting zero enriched terms.
  if (!(library in data)) {
    return {
      error:
        `Library '${library}' returned no result. It is probably retired or ` +
        `misspelled — read the enrichr://libraries resource or call ` +
        `suggest_libraries for the current catalog.`,
    };
  }

  return toResult(data[library], false, warning);
}

/**
 * Background-corrected enrichment via speedrichr.
 *
 * The background service is intermittently flaky — it can return HTTP 500 for a
 * library that works perfectly a few minutes later. Falling straight through to
 * the uncorrected endpoint on the first failure would silently hand back
 * whole-genome p-values (far more significant than the background-corrected
 * ones) when a retry would have produced the right answer, so failures are
 * retried before the result is demoted.
 *
 * If it still fails, we fall back to the classic endpoint rather than erroring
 * out, but flag the result `backgroundCorrected: false` and attach a warning.
 * A demoted result is never allowed to look like a corrected one.
 */
async function fetchLibraryWithBackground(
  speedListId: number,
  backgroundId: string,
  library: string,
  classicListId: () => Promise<number>
): Promise<EnrichmentResult | EnrichmentError> {
  const body = () =>
    new URLSearchParams({
      userListId: speedListId.toString(),
      backgroundid: backgroundId,
      backgroundType: library,
    });

  let failure = "unknown error";
  let attempts = 0;

  for (let attempt = 0; attempt <= BACKGROUND_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * attempt));
    }
    attempts++;

    try {
      const response = await fetch(`${SPEEDRICHR_URL}/backgroundenrich`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = parseEnrichrJson(await response.text());
        if (library in data) {
          return toResult(data[library], true);
        }
        // A well-formed response without the library is not worth retrying.
        failure = "library missing from the background-enrichment response";
        break;
      }

      failure = `HTTP ${response.status}`;
      // 4xx means the request itself is wrong; retrying will not help.
      if (response.status < 500) break;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  const warning =
    `Enrichr failed to run background-corrected enrichment for '${library}' ` +
    `after ${attempts} attempt${attempts === 1 ? "" : "s"} (${failure}). These ` +
    `p-values were computed against Enrichr's default whole-genome background ` +
    `and are NOT corrected for the background you supplied, so they overstate ` +
    `significance. Re-run to retry — this endpoint is intermittently unavailable.`;

  return fetchLibrary(await classicListId(), library, warning);
}

export async function queryEnrichrLibraries(
  geneList: string[],
  libraries: string[],
  description: string = "Gene list for enrichment",
  background?: string[]
): Promise<LibraryResults> {
  const failAll = (msg: string): LibraryResults =>
    Object.fromEntries(libraries.map((lib) => [lib, { error: msg }]));

  try {
    if (background && background.length > 0) {
      const [speedListId, backgroundId] = await Promise.all([
        submitGeneList(geneList, description, SPEEDRICHR_URL),
        submitBackground(background),
      ]);

      // Only submit to the classic service if a library actually falls back.
      let classicPromise: Promise<number> | null = null;
      const classicListId = () => {
        classicPromise ??= submitGeneList(geneList, description, ENRICHR_URL);
        return classicPromise;
      };

      const entries = await Promise.all(
        libraries.map(async (lib) => {
          try {
            return [
              lib,
              await fetchLibraryWithBackground(
                speedListId,
                backgroundId,
                lib,
                classicListId
              ),
            ] as const;
          } catch (error) {
            return [
              lib,
              {
                error: `Error querying ${lib}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ] as const;
          }
        })
      );

      return Object.fromEntries(entries);
    }

    const userListId = await submitGeneList(geneList, description);

    const entries = await Promise.all(
      libraries.map(async (lib) => {
        try {
          return [lib, await fetchLibrary(userListId, lib)] as const;
        } catch (error) {
          return [
            lib,
            {
              error: `Error querying ${lib}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ] as const;
        }
      })
    );

    return Object.fromEntries(entries);
  } catch (error) {
    return failAll(
      `Error querying Enrichr: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMultiLibraryResults(
  results: LibraryResults,
  maxTerms: number,
  format: OutputFormat
): string {
  const lines: string[] = [];

  for (const [library, result] of Object.entries(results)) {
    lines.push(`\n=== ${library} ===`);

    if ("error" in result) {
      lines.push(`Error: ${result.error}`);
      continue;
    }

    const { totalTerms, significantTerms, terms, backgroundCorrected, warning } =
      result;

    if (warning) {
      lines.push(`WARNING: ${warning}`);
    } else if (backgroundCorrected) {
      lines.push("Background-corrected against the supplied gene background.");
    }

    if (significantTerms === 0) {
      lines.push(
        `No significant terms found (adjusted p < 0.05) out of ${totalTerms} total terms analyzed.`
      );
      continue;
    }

    const shown = Math.min(significantTerms, maxTerms);
    lines.push(
      `Found ${significantTerms} significant terms (adjusted p < 0.05) out of ${totalTerms} total terms:`
    );
    if (significantTerms > maxTerms) {
      lines.push(`Showing top ${shown} terms:\n`);
    } else {
      lines.push("");
    }

    terms.slice(0, maxTerms).forEach((t, i) => {
      if (format === "compact") {
        lines.push(
          `${i + 1}. ${t.termName} (adj-p: ${t.adjustedPValue.toExponential(2)}, genes: ${t.overlappingGenes.length})`
        );
      } else if (format === "minimal") {
        lines.push(
          `${i + 1}. ${t.termName} (p: ${t.pValue.toExponential(2)})`
        );
      } else {
        lines.push(`${i + 1}. ${t.termName}`);
        lines.push(`   Adjusted P-value: ${t.adjustedPValue.toExponential(2)}`);
        lines.push(`   Raw P-value: ${t.pValue.toExponential(2)}`);
        lines.push(`   Odds Ratio: ${formatStat(t.oddsRatio, 2)}`);
        lines.push(`   Combined Score: ${formatStat(t.combinedScore, 2)}`);
        lines.push(
          `   Overlapping Genes (${t.overlappingGenes.length}): ${t.overlappingGenes.join(", ")}`
        );
        lines.push("");
      }
    });
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// TSV export
// ---------------------------------------------------------------------------

export function saveResultsToTSV(
  results: LibraryResults,
  filename: string,
  description: string = "Enrichment Analysis"
): void {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    "# Enrichr Enrichment Analysis Results",
    `# Generated: ${timestamp}`,
    `# Description: ${description}`,
    `# Libraries: ${Object.keys(results).join(", ")}`,
    "#",
    [
      "Library",
      "Rank",
      "Term_Name",
      "Term_ID",
      "Adjusted_P_Value",
      "Raw_P_Value",
      "Odds_Ratio",
      "Combined_Score",
      "Gene_Count",
      "Overlapping_Genes",
      "Background_Corrected",
    ].join("\t"),
  ];

  for (const [library, result] of Object.entries(results)) {
    if ("error" in result) {
      lines.push(
        [library, "ERROR", result.error, "", "", "", "", "", "", "", ""].join("\t")
      );
      continue;
    }

    if (result.warning) {
      lines.push(`# WARNING [${library}]: ${result.warning}`);
    }

    for (const t of result.terms) {
      const termIdMatch = t.termName.match(/\(([^)]+)\)$/);
      const termId = termIdMatch ? termIdMatch[1] : "";
      const cleanName = termId
        ? t.termName.replace(/\s*\([^)]+\)$/, "")
        : t.termName;

      lines.push(
        [
          library,
          t.rank.toString(),
          cleanName,
          termId,
          t.adjustedPValue.toExponential(6),
          t.pValue.toExponential(6),
          formatStat(t.oddsRatio, 4),
          formatStat(t.combinedScore, 4),
          t.overlappingGenes.length.toString(),
          t.overlappingGenes.join(";"),
          result.backgroundCorrected ? "yes" : "no",
        ].join("\t")
      );
    }
  }

  writeFileSync(filename, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Structured output types
// ---------------------------------------------------------------------------

const EnrichrTermSchema = z.object({
  rank: z.number(),
  termName: z.string(),
  pValue: z.number(),
  oddsRatio: z.number().nullable(),
  combinedScore: z.number().nullable(),
  overlappingGenes: z.array(z.string()),
  adjustedPValue: z.number(),
});

const LibraryResultSchema = z.object({
  totalTerms: z.number(),
  significantTerms: z.number(),
  terms: z.array(EnrichrTermSchema),
  backgroundCorrected: z.boolean(),
  warning: z.string().optional(),
});

const LibraryErrorSchema = z.object({
  error: z.string(),
});

const EnrichmentOutputSchema = z.object({
  results: z.record(z.string(), z.union([LibraryResultSchema, LibraryErrorSchema])),
  tsvFile: z.string().optional(),
});

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const CONFIG = parseConfig();

console.error(`Enrichr MCP Server v${VERSION} starting...`);
console.error(`Tools: enrichr_analysis, suggest_libraries`);
console.error(`Resources: enrichr://libraries, enrichr://libraries/{category}`);
console.error(`Prompts: enrichment_analysis`);
console.error(`Default libraries: ${CONFIG.defaultLibraries.join(", ")}`);
console.error(`Max terms per library: ${CONFIG.maxTermsPerLibrary}`);
console.error(`Format: ${CONFIG.format}`);
if (CONFIG.saveToFile) {
  console.error(`Output file: ${CONFIG.outputFile}`);
}

const server = new McpServer({
  name: "enrichr-server",
  version: VERSION,
});

// Build dynamic description
const configuredLibrariesDesc = CONFIG.defaultLibraries
  .map(
    (lib) =>
      `  - ${lib}: ${libraryDescriptions[lib] || "No description available."}`
  )
  .join("\n");

const toolDescription = `Perform gene set enrichment analysis using Enrichr across multiple gene set libraries. Returns only statistically significant terms (adjusted p < 0.05).

Configured default libraries:
${configuredLibrariesDesc}

Any library in Enrichr's live catalog is accepted. Enrichr adds and retires
libraries continuously, so do not rely on a memorized list: call
suggest_libraries, or read the enrichr://libraries resource, to discover the
libraries that currently exist.

Pass 'background' to test against a custom background gene set (for example,
only the genes expressed in your assay) instead of Enrichr's whole-genome
default. This is the statistically correct choice whenever the gene list was
drawn from a restricted universe, and it matters: the whole-genome default can
overstate significance by many orders of magnitude.

Each library's result reports 'backgroundCorrected'. If Enrichr's background
service is unavailable the result falls back to uncorrected whole-genome
p-values, flagged with a warning — treat those numbers as inflated and re-run
rather than reporting them as background-corrected.`;

server.registerTool(
  "enrichr_analysis",
  {
    title: "Enrichr Enrichment Analysis",
    description: toolDescription,
    inputSchema: z.object({
      genes: z
        .array(z.string())
        .min(2)
        .describe(
          "List of gene symbols to analyze (e.g., ['TP53', 'BRCA1', 'EGFR'])"
        ),
      libraries: z
        .array(z.string())
        .optional()
        .describe(
          "Enrichr libraries to query. Defaults to the configured libraries. " +
            "Use suggest_libraries to discover valid names."
        ),
      background: z
        .array(z.string())
        .min(MIN_BACKGROUND_GENES)
        .optional()
        .describe(
          "Custom background gene set to test against instead of the whole " +
            "genome — e.g. all genes detected in your experiment. Strongly " +
            "recommended when the gene list came from a restricted universe " +
            "(expressed genes, a targeted panel), since the whole-genome " +
            "default inflates significance. Must contain the universe the gene " +
            "list was drawn from, not just the gene list itself."
        ),
      description: z
        .string()
        .optional()
        .describe("Optional description for the gene list"),
      maxTerms: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum terms to show per library"),
      format: z
        .enum(["detailed", "compact", "minimal"])
        .optional()
        .describe("Output format"),
      outputFile: z
        .string()
        .optional()
        .describe("Path to save complete results as TSV file"),
    }),
    outputSchema: EnrichmentOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({
    genes,
    libraries,
    background,
    description,
    maxTerms,
    format,
    outputFile,
  }) => {
    const libs = libraries ?? CONFIG.defaultLibraries;
    const desc = description ?? "Gene list for enrichment analysis";
    const max = maxTerms ?? CONFIG.maxTermsPerLibrary;
    const fmt = format ?? CONFIG.format;
    const outFile = outputFile ?? (CONFIG.saveToFile ? CONFIG.outputFile : undefined);

    const resultsData = await queryEnrichrLibraries(genes, libs, desc, background);
    const formattedText = formatMultiLibraryResults(resultsData, max, fmt);

    let tsvFile: string | undefined;
    let textOutput = formattedText;

    if (outFile) {
      try {
        saveResultsToTSV(resultsData, outFile, desc);
        tsvFile = outFile;
        textOutput += `\n\nComplete results saved to: ${outFile}`;
      } catch (error) {
        textOutput += `\n\nError saving TSV: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return {
      content: [{ type: "text" as const, text: textOutput }],
      structuredContent: {
        results: toJsonSafeResults(resultsData),
        ...(tsvFile ? { tsvFile } : {}),
      },
    };
  }
);

// ---------------------------------------------------------------------------
// suggest_libraries helper
// ---------------------------------------------------------------------------

const categoryNames = Object.keys(LIBRARY_CATEGORIES) as [string, ...string[]];

/** The bundled descriptions as catalog entries, for when no live catalog is given. */
function bundledEntries(): CatalogEntry[] {
  return Object.entries(libraryDescriptions).map(([library, description]) => ({
    library,
    category: libraryToCategory[library] ?? "other",
    description,
    termCount: 0,
  }));
}

/**
 * Rank libraries against a free-text research question.
 *
 * Pass `catalog` to score only libraries Enrichr currently serves; without it
 * the bundled descriptions are used, which include libraries Enrichr has since
 * retired.
 */
export function suggestLibraries(
  query: string,
  category?: string,
  maxResults: number = 10,
  catalog?: Catalog
): Array<{ library: string; category: string; description: string; relevanceScore: number }> {
  // Tokenize query to lowercase keywords, drop short words
  const keywords = query
    .toLowerCase()
    .split(/[\s\-_/,.;:!?()]+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) return [];

  const entries = catalog ? [...catalog.entries.values()] : bundledEntries();
  const candidates = category
    ? entries.filter((e) => e.category === category)
    : entries;

  const scored: Array<{ library: string; category: string; description: string; relevanceScore: number }> = [];

  for (const entry of candidates) {
    const libText = entry.library.replace(/_/g, " ").toLowerCase();
    const descText = entry.description.toLowerCase();
    const searchText = libText + " " + descText;

    let score = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) {
        score += 1;
        // Bonus for library-name match
        if (libText.includes(kw)) score += 1;
      }
    }

    if (score > 0) {
      scored.push({
        library: entry.library,
        category: entry.category,
        description: entry.description,
        relevanceScore: score,
      });
    }
  }

  // Equally relevant libraries are not equally useful: Enrichr ships many
  // vintages of the same library (GO_Biological_Process_2013 … _2026) whose
  // names and descriptions score identically, so break ties on the version year
  // and recommend the current data rather than whichever Enrichr happened to
  // list first.
  scored.sort(
    (a, b) =>
      b.relevanceScore - a.relevanceScore ||
      libraryYear(b.library) - libraryYear(a.library) ||
      a.library.localeCompare(b.library)
  );
  return scored.slice(0, maxResults);
}

/** The version year in a library name, or 0 for unversioned libraries. */
function libraryYear(library: string): number {
  let latest = 0;
  for (const match of library.matchAll(/(?:^|[_\-])(19|20)(\d{2})(?=$|[_\-])/g)) {
    latest = Math.max(latest, Number(match[1] + match[2]));
  }
  return latest;
}

// ---------------------------------------------------------------------------
// suggest_libraries tool
// ---------------------------------------------------------------------------

const SuggestOutputSchema = z.object({
  suggestions: z.array(z.object({
    library: z.string(),
    category: z.string(),
    description: z.string(),
    relevanceScore: z.number(),
  })),
  totalAvailable: z.number(),
  query: z.string(),
});

server.registerTool(
  "suggest_libraries",
  {
    title: "Suggest Enrichr Libraries",
    description:
      "Suggest relevant Enrichr libraries for a research question. Use this before enrichr_analysis to pick the best libraries for a specific topic.",
    inputSchema: z.object({
      query: z.string().describe("Research context (e.g., 'DNA repair', 'breast cancer drug resistance')"),
      category: z.enum(categoryNames).optional().describe("Filter by category"),
      maxResults: z.number().int().min(1).max(50).optional().describe("Max results (default: 10)"),
    }),
    outputSchema: SuggestOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, category, maxResults }) => {
    const max = maxResults ?? 10;
    const catalog = await getCatalog();
    const suggestions = suggestLibraries(query, category, max, catalog);

    const textLines = [`Library suggestions for: "${query}"`, ""];
    if (!catalog.live) {
      textLines.push(
        "NOTE: Enrichr's catalog was unreachable; these suggestions come from " +
          "the bundled list and may include retired libraries.",
        ""
      );
    }
    if (suggestions.length === 0) {
      textLines.push("No matching libraries found.");
    } else {
      for (const s of suggestions) {
        textLines.push(`- ${s.library} [${s.category}] (score: ${s.relevanceScore})`);
        textLines.push(`  ${s.description}`);
      }
    }

    return {
      content: [{ type: "text" as const, text: textLines.join("\n") }],
      structuredContent: {
        suggestions,
        totalAvailable: catalog.entries.size,
        query,
      },
    };
  }
);

// ---------------------------------------------------------------------------
// Library catalog helpers
// ---------------------------------------------------------------------------

/** Group catalog entries by category, preserving the declared category order. */
function groupByCategory(catalog?: Catalog): Map<string, CatalogEntry[]> {
  const entries = catalog ? [...catalog.entries.values()] : bundledEntries();
  const grouped = new Map<string, CatalogEntry[]>();

  // Seed with the declared categories so their order is stable in the output.
  for (const cat of Object.keys(LIBRARY_CATEGORIES)) grouped.set(cat, []);

  for (const entry of entries) {
    const bucket = grouped.get(entry.category);
    if (bucket) bucket.push(entry);
    else grouped.set(entry.category, [entry]);
  }

  for (const [cat, libs] of grouped) {
    if (libs.length === 0) grouped.delete(cat);
    else libs.sort((a, b) => a.library.localeCompare(b.library));
  }

  return grouped;
}

export function formatFullCatalog(catalog?: Catalog): string {
  const lines: string[] = ["# Enrichr Library Catalog", ""];
  if (catalog && !catalog.live) {
    lines.push(
      "NOTE: Enrichr's catalog was unreachable; this is the bundled list and " +
        "may include retired libraries.",
      ""
    );
  }
  for (const [cat, libs] of groupByCategory(catalog)) {
    lines.push(`## ${cat} (${libs.length} libraries)`);
    for (const entry of libs) {
      lines.push(`- ${entry.library}: ${entry.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatCategoryCatalog(
  category: string,
  catalog?: Catalog
): string {
  const grouped = groupByCategory(catalog);
  const libs = grouped.get(category);
  if (!libs) {
    return `Unknown category: "${category}". Available categories: ${[...grouped.keys()].join(", ")}`;
  }
  const lines: string[] = [`# ${category} (${libs.length} libraries)`, ""];
  for (const entry of libs) {
    lines.push(`- ${entry.library}: ${entry.description}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Library catalog resources
// ---------------------------------------------------------------------------

server.registerResource(
  "library_catalog",
  "enrichr://libraries",
  {
    title: "Enrichr Library Catalog",
    description: "All available Enrichr libraries organized by category",
    mimeType: "text/plain",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, text: formatFullCatalog(await getCatalog()) }],
  })
);

server.registerResource(
  "library_catalog_by_category",
  new ResourceTemplate("enrichr://libraries/{category}", {
    list: async () => ({
      resources: Object.keys(LIBRARY_CATEGORIES).map((cat) => ({
        uri: `enrichr://libraries/${cat}`,
        name: `${cat} libraries`,
      })),
    }),
    complete: {
      category: (value: string) =>
        Object.keys(LIBRARY_CATEGORIES).filter((c) => c.startsWith(value)),
    },
  }),
  {
    title: "Enrichr Libraries by Category",
    description: "Libraries for a specific category",
    mimeType: "text/plain",
  },
  async (uri, variables) => ({
    contents: [
      {
        uri: uri.href,
        text: formatCategoryCatalog(
          variables.category as string,
          await getCatalog()
        ),
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// enrichment_analysis prompt
// ---------------------------------------------------------------------------

export function buildEnrichmentPrompt(genes: string, context?: string): string {
  const lines: string[] = [
    "# Gene Set Enrichment Analysis Workflow",
    "",
    "## Gene List",
    genes,
    "",
  ];

  if (context) {
    lines.push(
      "## Research Context",
      context,
      "",
      "## Step 1: Library Selection",
      `Call \`suggest_libraries\` with the query: "${context}" to find the most relevant Enrichr libraries for this research context.`,
      "",
    );
  }

  lines.push(
    `## ${context ? "Step 2" : "Step 1"}: Enrichment Analysis`,
    "Call `enrichr_analysis` with the gene list above and the selected libraries (or use defaults).",
    "",
    `## ${context ? "Step 3" : "Step 2"}: Interpretation`,
    "When interpreting results, consider:",
    "- Convergent themes across multiple libraries",
    "- Top enriched pathways and biological processes",
    "- Potential therapeutic targets or drug associations",
    "- Unexpected findings that may suggest novel biology",
  );

  return lines.join("\n");
}

server.registerPrompt(
  "enrichment_analysis",
  {
    title: "Enrichment Analysis Workflow",
    description:
      "Guided workflow for gene set enrichment analysis with library selection and interpretation",
    argsSchema: {
      genes: z.string().describe("Gene symbols, comma or newline separated"),
      context: z.string().optional().describe("Research context for library selection"),
    },
  },
  async ({ genes, context }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: buildEnrichmentPrompt(genes, context),
        },
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
