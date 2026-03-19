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
const FETCH_TIMEOUT_MS = 30_000;

const POPULAR_LIBRARIES = [
  "GO_Biological_Process_2025",
  "KEGG_2021_Human",
  "Reactome_2022",
  "MSigDB_Hallmark_2020",
  "ChEA_2022",
  "GWAS_Catalog_2023",
  "Human_Phenotype_Ontology",
  "STRING_Interactions_2023",
  "DrugBank_2022",
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
  oddsRatio: number;
  combinedScore: number;
  overlappingGenes: string[];
  adjustedPValue: number;
}

export interface EnrichmentResult {
  totalTerms: number;
  significantTerms: number;
  terms: EnrichrTerm[];
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

// ---------------------------------------------------------------------------
// Enrichr API
// ---------------------------------------------------------------------------

async function submitGeneList(
  geneList: string[],
  description: string
): Promise<number> {
  const formData = new FormData();
  formData.append("list", geneList.join("\n"));
  formData.append("description", description);

  const response = await fetch(`${ENRICHR_URL}/addList`, {
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

async function fetchLibrary(
  userListId: number,
  library: string
): Promise<[string, EnrichmentResult | EnrichmentError]> {
  try {
    const params = new URLSearchParams({
      userListId: userListId.toString(),
      backgroundType: library,
    });

    const response = await fetch(`${ENRICHR_URL}/enrich?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return [
        library,
        { error: `HTTP ${response.status}: ${response.statusText}` },
      ];
    }

    const data = (await response.json()) as any;
    if (!(library in data)) {
      return [
        library,
        {
          error: `Library '${library}' not found. Available: ${Object.keys(data).join(", ")}`,
        },
      ];
    }

    const allResults: any[] = data[library];
    const significantResults = allResults
      .filter((r: any[]) => r[6] < 0.05)
      .map(parseEnrichrTuple);

    return [
      library,
      {
        totalTerms: allResults.length,
        significantTerms: significantResults.length,
        terms: significantResults,
      },
    ];
  } catch (error) {
    return [
      library,
      {
        error: `Error querying ${library}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
}

export async function queryEnrichrLibraries(
  geneList: string[],
  libraries: string[],
  description: string = "Gene list for enrichment"
): Promise<LibraryResults> {
  try {
    const userListId = await submitGeneList(geneList, description);

    // Parallel library queries
    const entries = await Promise.all(
      libraries.map((lib) => fetchLibrary(userListId, lib))
    );

    return Object.fromEntries(entries);
  } catch (error) {
    const msg = `Error querying Enrichr: ${error instanceof Error ? error.message : String(error)}`;
    return Object.fromEntries(libraries.map((lib) => [lib, { error: msg }]));
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

    const { totalTerms, significantTerms, terms } = result;

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
        lines.push(`   Odds Ratio: ${t.oddsRatio.toFixed(2)}`);
        lines.push(`   Combined Score: ${t.combinedScore.toFixed(2)}`);
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
    ].join("\t"),
  ];

  for (const [library, result] of Object.entries(results)) {
    if ("error" in result) {
      lines.push(
        [library, "ERROR", result.error, "", "", "", "", "", "", ""].join("\t")
      );
      continue;
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
          t.oddsRatio.toFixed(4),
          t.combinedScore.toFixed(4),
          t.overlappingGenes.length.toString(),
          t.overlappingGenes.join(";"),
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
  oddsRatio: z.number(),
  combinedScore: z.number(),
  overlappingGenes: z.array(z.string()),
  adjustedPValue: z.number(),
});

const LibraryResultSchema = z.object({
  totalTerms: z.number(),
  significantTerms: z.number(),
  terms: z.array(EnrichrTermSchema),
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

const allAvailableLibraries = Object.keys(libraryDescriptions)
  .map((lib) => `'${lib}'`)
  .join(", ");

const toolDescription = `Perform gene set enrichment analysis using Enrichr across multiple gene set libraries. Returns only statistically significant terms (adjusted p < 0.05).

Configured default libraries:
${configuredLibrariesDesc}

Use suggest_libraries to find relevant libraries for your research context.

Select the most relevant library/libraries based on the user's query.`;

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
          `Enrichr libraries to query. Defaults to configured libraries. Available: ${allAvailableLibraries}`
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

    const resultsData = await queryEnrichrLibraries(genes, libs, desc);
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
        results: resultsData,
        ...(tsvFile ? { tsvFile } : {}),
      },
    };
  }
);

// ---------------------------------------------------------------------------
// suggest_libraries helper
// ---------------------------------------------------------------------------

const categoryNames = Object.keys(LIBRARY_CATEGORIES) as [string, ...string[]];

export function suggestLibraries(
  query: string,
  category?: string,
  maxResults: number = 10
): Array<{ library: string; category: string; description: string; relevanceScore: number }> {
  // Tokenize query to lowercase keywords, drop short words
  const keywords = query
    .toLowerCase()
    .split(/[\s\-_/,.;:!?()]+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) return [];

  // Determine candidate libraries
  let candidates: string[];
  if (category && LIBRARY_CATEGORIES[category]) {
    candidates = LIBRARY_CATEGORIES[category];
  } else {
    candidates = Object.keys(libraryDescriptions);
  }

  const scored: Array<{ library: string; category: string; description: string; relevanceScore: number }> = [];

  for (const lib of candidates) {
    const desc = libraryDescriptions[lib] ?? "";
    const libText = lib.replace(/_/g, " ").toLowerCase();
    const descText = desc.toLowerCase();
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
        library: lib,
        category: libraryToCategory[lib] ?? "other",
        description: desc,
        relevanceScore: score,
      });
    }
  }

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored.slice(0, maxResults);
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
    const suggestions = suggestLibraries(query, category, max);

    const textLines = [`Library suggestions for: "${query}"`, ""];
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
        totalAvailable: Object.keys(libraryDescriptions).length,
        query,
      },
    };
  }
);

// ---------------------------------------------------------------------------
// Library catalog helpers
// ---------------------------------------------------------------------------

export function formatFullCatalog(): string {
  const lines: string[] = ["# Enrichr Library Catalog", ""];
  for (const [cat, libs] of Object.entries(LIBRARY_CATEGORIES)) {
    lines.push(`## ${cat} (${libs.length} libraries)`);
    for (const lib of libs) {
      const desc = libraryDescriptions[lib] ?? "";
      lines.push(`- ${lib}: ${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatCategoryCatalog(category: string): string {
  const libs = LIBRARY_CATEGORIES[category];
  if (!libs) {
    return `Unknown category: "${category}". Available categories: ${Object.keys(LIBRARY_CATEGORIES).join(", ")}`;
  }
  const lines: string[] = [`# ${category} (${libs.length} libraries)`, ""];
  for (const lib of libs) {
    const desc = libraryDescriptions[lib] ?? "";
    lines.push(`- ${lib}: ${desc}`);
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
    contents: [{ uri: uri.href, text: formatFullCatalog() }],
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
        text: formatCategoryCatalog(variables.category as string),
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
