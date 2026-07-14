import { describe, it, expect } from "vitest";
import {
  parseConfig,
  formatMultiLibraryResults,
  saveResultsToTSV,
  suggestLibraries,
  parseEnrichrJson,
  formatFullCatalog,
  formatCategoryCatalog,
  buildEnrichmentPrompt,
  type LibraryResults,
  type EnrichmentResult,
  type EnrichmentError,
  type EnrichrTerm,
} from "../index.js";
import { libraryDescriptions, LIBRARY_CATEGORIES, libraryToCategory } from "../library_descriptions.js";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTerm(overrides: Partial<EnrichrTerm> = {}): EnrichrTerm {
  return {
    rank: 1,
    termName: "apoptotic process (GO:0006915)",
    pValue: 1.23e-10,
    oddsRatio: 5.5,
    combinedScore: 120.5,
    overlappingGenes: ["TP53", "BRCA1", "BCL2"],
    adjustedPValue: 4.56e-8,
    ...overrides,
  };
}

function makeResult(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
  return {
    totalTerms: 500,
    significantTerms: 2,
    backgroundCorrected: false,
    terms: [
      makeTerm(),
      makeTerm({
        rank: 2,
        termName: "cell cycle (GO:0007049)",
        pValue: 5e-8,
        adjustedPValue: 1.2e-5,
        overlappingGenes: ["TP53", "RB1"],
      }),
    ],
    ...overrides,
  };
}

const sampleResults: LibraryResults = {
  GO_Biological_Process_2025: makeResult(),
  KEGG_2021_Human: { error: "HTTP 500: Internal Server Error" },
};

// ---------------------------------------------------------------------------
// parseConfig
// ---------------------------------------------------------------------------

describe("parseConfig", () => {
  it("returns defaults with no arguments", () => {
    const cfg = parseConfig([]);
    expect(cfg.format).toBe("detailed");
    expect(cfg.maxTermsPerLibrary).toBe(50);
    expect(cfg.saveToFile).toBe(false);
    expect(cfg.defaultLibraries).toContain("GO_Biological_Process_2026");
  });

  it("parses --libraries flag", () => {
    const cfg = parseConfig(["--libraries", "KEGG_2021_Human,Reactome_2022"]);
    expect(cfg.defaultLibraries).toEqual(["KEGG_2021_Human", "Reactome_2022"]);
  });

  it("parses -l pop as popular libraries", () => {
    const cfg = parseConfig(["-l", "pop"]);
    expect(cfg.defaultLibraries.length).toBeGreaterThan(5);
    expect(cfg.defaultLibraries).toContain("GO_Biological_Process_2026");
  });

  it("parses --max-terms", () => {
    const cfg = parseConfig(["--max-terms", "20"]);
    expect(cfg.maxTermsPerLibrary).toBe(20);
  });

  it("ignores invalid --max-terms", () => {
    const cfg = parseConfig(["--max-terms", "abc"]);
    expect(cfg.maxTermsPerLibrary).toBe(50);
  });

  it("parses --format", () => {
    const cfg = parseConfig(["--format", "compact"]);
    expect(cfg.format).toBe("compact");
  });

  it("parses --compact shorthand", () => {
    const cfg = parseConfig(["--compact"]);
    expect(cfg.format).toBe("compact");
  });

  it("parses --minimal shorthand", () => {
    const cfg = parseConfig(["--minimal"]);
    expect(cfg.format).toBe("minimal");
  });

  it("parses --output", () => {
    const cfg = parseConfig(["--output", "/tmp/results.tsv"]);
    expect(cfg.outputFile).toBe("/tmp/results.tsv");
    expect(cfg.saveToFile).toBe(true);
  });

  it("combines multiple flags", () => {
    const cfg = parseConfig([
      "-l", "KEGG_2021_Human",
      "-m", "10",
      "-f", "minimal",
      "-o", "/tmp/out.tsv",
    ]);
    expect(cfg.defaultLibraries).toEqual(["KEGG_2021_Human"]);
    expect(cfg.maxTermsPerLibrary).toBe(10);
    expect(cfg.format).toBe("minimal");
    expect(cfg.outputFile).toBe("/tmp/out.tsv");
    expect(cfg.saveToFile).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatMultiLibraryResults
// ---------------------------------------------------------------------------

describe("formatMultiLibraryResults", () => {
  it("formats detailed output", () => {
    const text = formatMultiLibraryResults(sampleResults, 50, "detailed");
    expect(text).toContain("=== GO_Biological_Process_2025 ===");
    expect(text).toContain("apoptotic process");
    expect(text).toContain("Adjusted P-value:");
    expect(text).toContain("Raw P-value:");
    expect(text).toContain("Odds Ratio:");
    expect(text).toContain("Combined Score:");
    expect(text).toContain("Overlapping Genes (3):");
    expect(text).toContain("TP53");
  });

  it("formats compact output", () => {
    const text = formatMultiLibraryResults(sampleResults, 50, "compact");
    expect(text).toContain("adj-p:");
    expect(text).toContain("genes: 3");
    expect(text).not.toContain("Odds Ratio:");
  });

  it("formats minimal output", () => {
    const text = formatMultiLibraryResults(sampleResults, 50, "minimal");
    expect(text).toContain("(p:");
    expect(text).not.toContain("adj-p:");
    expect(text).not.toContain("Odds Ratio:");
  });

  it("shows error for failed libraries", () => {
    const text = formatMultiLibraryResults(sampleResults, 50, "detailed");
    expect(text).toContain("=== KEGG_2021_Human ===");
    expect(text).toContain("Error: HTTP 500");
  });

  it("handles no significant terms", () => {
    const results: LibraryResults = {
      TestLib: makeResult({ significantTerms: 0, terms: [] }),
    };
    const text = formatMultiLibraryResults(results, 50, "detailed");
    expect(text).toContain("No significant terms found");
  });

  it("respects maxTerms limit", () => {
    const text = formatMultiLibraryResults(sampleResults, 1, "compact");
    // Should only contain 1 numbered item for the successful library
    const matches = text.match(/^\d+\./gm);
    expect(matches?.length).toBe(1);
  });

  it("shows truncation message when terms exceed maxTerms", () => {
    const text = formatMultiLibraryResults(sampleResults, 1, "compact");
    expect(text).toContain("Showing top 1 terms");
  });
});

// ---------------------------------------------------------------------------
// saveResultsToTSV
// ---------------------------------------------------------------------------

describe("saveResultsToTSV", () => {
  const tmpFile = join("/tmp", `enrichr-test-${Date.now()}.tsv`);

  it("writes valid TSV with headers", () => {
    saveResultsToTSV(sampleResults, tmpFile, "Test analysis");
    const content = readFileSync(tmpFile, "utf-8");

    expect(content).toContain("# Enrichr Enrichment Analysis Results");
    expect(content).toContain("# Description: Test analysis");
    expect(content).toContain("Library\tRank\tTerm_Name\tTerm_ID");

    // Data rows
    expect(content).toContain("GO_Biological_Process_2025\t1\tapoptotic process\tGO:0006915");
    expect(content).toContain("KEGG_2021_Human\tERROR\tHTTP 500");

    // Cleanup
    unlinkSync(tmpFile);
  });

  it("extracts term IDs from parenthetical notation", () => {
    const results: LibraryResults = {
      TestLib: makeResult({
        terms: [makeTerm({ termName: "some process (GO:1234567)" })],
      }),
    };
    saveResultsToTSV(results, tmpFile);
    const content = readFileSync(tmpFile, "utf-8");
    expect(content).toContain("some process\tGO:1234567");
    unlinkSync(tmpFile);
  });
});

// ---------------------------------------------------------------------------
// EnrichrTerm mapping
// ---------------------------------------------------------------------------

describe("EnrichrTerm structure", () => {
  it("has all expected fields", () => {
    const term = makeTerm();
    expect(term).toHaveProperty("rank");
    expect(term).toHaveProperty("termName");
    expect(term).toHaveProperty("pValue");
    expect(term).toHaveProperty("oddsRatio");
    expect(term).toHaveProperty("combinedScore");
    expect(term).toHaveProperty("overlappingGenes");
    expect(term).toHaveProperty("adjustedPValue");
    expect(Array.isArray(term.overlappingGenes)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Category data integrity
// ---------------------------------------------------------------------------

describe("LIBRARY_CATEGORIES", () => {
  it("every library in libraryDescriptions appears in exactly one category", () => {
    const allLibs = Object.keys(libraryDescriptions);
    for (const lib of allLibs) {
      const cats = Object.entries(LIBRARY_CATEGORIES)
        .filter(([, libs]) => libs.includes(lib))
        .map(([cat]) => cat);
      expect(cats).toHaveLength(1);
    }
  });

  it("every entry in LIBRARY_CATEGORIES exists in libraryDescriptions", () => {
    for (const [cat, libs] of Object.entries(LIBRARY_CATEGORIES)) {
      for (const lib of libs) {
        expect(libraryDescriptions).toHaveProperty(lib);
      }
    }
  });

  it("libraryToCategory maps all libraries", () => {
    for (const lib of Object.keys(libraryDescriptions)) {
      expect(libraryToCategory[lib]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// suggestLibraries
// ---------------------------------------------------------------------------

describe("suggestLibraries", () => {
  it("returns cancer-related libs for 'cancer'", () => {
    const results = suggestLibraries("cancer");
    expect(results.length).toBeGreaterThan(0);
    const libs = results.map((r) => r.library);
    expect(libs).toContain("COSMIC_Cancer_Gene_Census");
  });

  it("respects category filter", () => {
    const results = suggestLibraries("expression", "cell_types");
    for (const r of results) {
      expect(r.category).toBe("cell_types");
    }
  });

  it("respects maxResults", () => {
    const results = suggestLibraries("gene", undefined, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns empty for nonsense query", () => {
    const results = suggestLibraries("zzzzxqwkjfh");
    expect(results).toHaveLength(0);
  });

  it("library-name matches score higher than description-only matches", () => {
    const results = suggestLibraries("kinase");
    // KEA or Kinase_Perturbations should rank high since "kinase" is in their name
    const topLib = results[0];
    expect(topLib.library.toLowerCase()).toContain("kinase");
  });
});

// ---------------------------------------------------------------------------
// formatFullCatalog / formatCategoryCatalog
// ---------------------------------------------------------------------------

describe("formatFullCatalog", () => {
  it("contains all category headers", () => {
    const text = formatFullCatalog();
    for (const cat of Object.keys(LIBRARY_CATEGORIES)) {
      expect(text).toContain(`## ${cat}`);
    }
  });

  it("contains library names", () => {
    const text = formatFullCatalog();
    expect(text).toContain("KEGG_2021_Human");
    expect(text).toContain("GO_Biological_Process_2025");
  });
});

describe("formatCategoryCatalog", () => {
  it("returns only libs from requested category", () => {
    const text = formatCategoryCatalog("cancer");
    expect(text).toContain("COSMIC_Cancer_Gene_Census");
    expect(text).not.toContain("KEGG_2021_Human");
  });

  it("returns message for invalid category", () => {
    const text = formatCategoryCatalog("nonexistent_category");
    expect(text).toContain("Unknown category");
    expect(text).toContain("Available categories");
  });
});

// ---------------------------------------------------------------------------
// buildEnrichmentPrompt
// ---------------------------------------------------------------------------

describe("buildEnrichmentPrompt", () => {
  it("includes gene list", () => {
    const prompt = buildEnrichmentPrompt("TP53,BRCA1");
    expect(prompt).toContain("TP53,BRCA1");
  });

  it("includes context when provided", () => {
    const prompt = buildEnrichmentPrompt("TP53,BRCA1", "breast cancer");
    expect(prompt).toContain("breast cancer");
    expect(prompt).toContain("Research Context");
  });

  it("mentions suggest_libraries when context given", () => {
    const prompt = buildEnrichmentPrompt("TP53,BRCA1", "DNA repair");
    expect(prompt).toContain("suggest_libraries");
  });

  it("mentions enrichr_analysis", () => {
    const prompt = buildEnrichmentPrompt("TP53,BRCA1");
    expect(prompt).toContain("enrichr_analysis");
  });

  it("does not mention suggest_libraries when no context", () => {
    const prompt = buildEnrichmentPrompt("TP53,BRCA1");
    expect(prompt).not.toContain("suggest_libraries");
  });
});

// ---------------------------------------------------------------------------
// Background correction
// ---------------------------------------------------------------------------

describe("background-corrected results", () => {
  it("labels a background-corrected library in detailed output", () => {
    const results: LibraryResults = {
      KEGG_2026: makeResult({ backgroundCorrected: true }),
    };
    const text = formatMultiLibraryResults(results, 50, "detailed");
    expect(text).toContain("Background-corrected against the supplied gene background.");
    expect(text).not.toContain("WARNING");
  });

  it("surfaces a WARNING when Enrichr could not honour the background", () => {
    const results: LibraryResults = {
      GO_Biological_Process_2026: makeResult({
        backgroundCorrected: false,
        warning:
          "Enrichr could not run background-corrected enrichment for " +
          "'GO_Biological_Process_2026' (HTTP 500); these p-values are NOT corrected.",
      }),
    };
    const text = formatMultiLibraryResults(results, 50, "detailed");
    expect(text).toContain("WARNING:");
    expect(text).toContain("NOT corrected");
  });

  // The whole point of the fallback: a demoted result must never look clean.
  it("never reports a warned library as background-corrected", () => {
    const results: LibraryResults = {
      GO_Biological_Process_2026: makeResult({
        backgroundCorrected: false,
        warning: "could not apply background",
      }),
    };
    const text = formatMultiLibraryResults(results, 50, "detailed");
    expect(text).not.toContain("Background-corrected against");
  });

  it("records background provenance per row in the TSV", () => {
    const tmp = join("/tmp", `enrichr-bg-${process.pid}.tsv`);
    const results: LibraryResults = {
      KEGG_2026: makeResult({ backgroundCorrected: true }),
      GO_Biological_Process_2026: makeResult({
        backgroundCorrected: false,
        warning: "could not apply background",
      }),
    };
    saveResultsToTSV(results, tmp);
    const content = readFileSync(tmp, "utf-8");

    expect(content).toContain("Background_Corrected");
    expect(content).toContain("# WARNING [GO_Biological_Process_2026]");
    const kegg = content.split("\n").find((l) => l.startsWith("KEGG_2026\t1\t"));
    const go = content.split("\n").find((l) => l.startsWith("GO_Biological_Process_2026\t1\t"));
    expect(kegg?.endsWith("\tyes")).toBe(true);
    expect(go?.endsWith("\tno")).toBe(true);

    unlinkSync(tmp);
  });
});

// ---------------------------------------------------------------------------
// Live catalog
// ---------------------------------------------------------------------------

describe("suggestLibraries with a live catalog", () => {
  // A catalog holding one live library and none of the retired ones.
  const catalog = {
    entries: new Map([
      [
        "GO_Biological_Process_2026",
        {
          library: "GO_Biological_Process_2026",
          category: "ontologies",
          description: "Gene Ontology biological process terms (2026).",
          termCount: 5000,
        },
      ],
    ]),
    live: true,
    fetchedAt: Date.now(),
  };

  it("only suggests libraries present in the catalog", () => {
    const hits = suggestLibraries("gene ontology process", undefined, 10, catalog);
    expect(hits.map((h) => h.library)).toEqual(["GO_Biological_Process_2026"]);
  });

  it("does not suggest a retired library that the bundled list still describes", () => {
    // CMAP_2023 is described in library_descriptions.ts but Enrichr retired it.
    const bundled = suggestLibraries("connectivity map drug", undefined, 50);
    expect(bundled.some((h) => h.library === "CMAP_2023")).toBe(true);

    const live = suggestLibraries("connectivity map drug", undefined, 50, catalog);
    expect(live.some((h) => h.library === "CMAP_2023")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseEnrichrJson
// ---------------------------------------------------------------------------

describe("parseEnrichrJson", () => {
  // Enrichr emits bare Infinity for the odds ratio; JSON.parse rejects it.
  it("parses the bare Infinity literal Enrichr emits", () => {
    const body = '{"KEGG_2026":[[1,"Term",1.5e-6,Infinity,Infinity,["TP53"],2.3e-5]]}';
    expect(() => JSON.parse(body)).toThrow();

    const parsed = parseEnrichrJson(body);
    const [row] = parsed.KEGG_2026;
    expect(row[3]).toBe(Infinity);
    expect(row[4]).toBe(Infinity);
    expect(row[2]).toBe(1.5e-6);
    expect(row[5]).toEqual(["TP53"]);
  });

  it("parses -Infinity and NaN", () => {
    const parsed = parseEnrichrJson('{"L":[[1,"T",1e-3,-Infinity,NaN,["A"],1e-2]]}');
    const [row] = parsed.L;
    expect(row[3]).toBe(-Infinity);
    expect(row[4]).toBeNull();
  });

  // The rewrite is value-position only, so a term named "Infinity" survives.
  it("does not corrupt the word Infinity inside a term name", () => {
    const parsed = parseEnrichrJson('{"L":[[1,"Infinity and NaN pathway",1e-3,2.0,3.0,["A"],1e-2]]}');
    expect(parsed.L[0][1]).toBe("Infinity and NaN pathway");
  });

  it("still parses ordinary finite responses", () => {
    const parsed = parseEnrichrJson('{"L":[[1,"T",1e-3,2.5,3.5,["A"],1e-2]]}');
    expect(parsed.L[0][3]).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// Non-finite statistics in output
// ---------------------------------------------------------------------------

describe("non-finite statistics", () => {
  it("renders an infinite odds ratio as Inf rather than crashing", () => {
    const results: LibraryResults = {
      KEGG_2026: makeResult({
        backgroundCorrected: true,
        significantTerms: 1,
        terms: [makeTerm({ oddsRatio: Infinity, combinedScore: Infinity })],
      }),
    };
    const text = formatMultiLibraryResults(results, 50, "detailed");
    expect(text).toContain("Odds Ratio: Inf");
    expect(text).toContain("Combined Score: Inf");
  });

  it("writes Inf into the TSV", () => {
    const tmp = join("/tmp", `enrichr-inf-${process.pid}.tsv`);
    saveResultsToTSV(
      {
        KEGG_2026: makeResult({
          backgroundCorrected: true,
          significantTerms: 1,
          terms: [makeTerm({ oddsRatio: Infinity, combinedScore: 12.5 })],
        }),
      },
      tmp
    );
    const content = readFileSync(tmp, "utf-8");
    expect(content).toContain("\tInf\t12.5000\t");
    unlinkSync(tmp);
  });
});

// ---------------------------------------------------------------------------
// Version recency
// ---------------------------------------------------------------------------

describe("suggestLibraries version ranking", () => {
  // Enrichr ships many vintages whose names and descriptions score identically.
  // Recommending GO_Biological_Process_2013 over _2026 would be a real
  // regression, so equal-scoring libraries must rank newest first.
  const vintages = [
    "GO_Biological_Process_2013",
    "GO_Biological_Process_2026",
    "GO_Biological_Process_2021",
    "GO_Biological_Process_2025",
  ];
  const catalog = {
    entries: new Map(
      vintages.map((library) => [
        library,
        {
          library,
          category: "ontologies",
          // Identical descriptions => identical relevance scores => pure tiebreak.
          description: "Gene Ontology biological process terms.",
          termCount: 100,
        },
      ])
    ),
    live: true,
    fetchedAt: Date.now(),
  };

  it("ranks the newest vintage first when relevance ties", () => {
    const hits = suggestLibraries("gene ontology biological process", undefined, 4, catalog);
    expect(hits.map((h) => h.library)).toEqual([
      "GO_Biological_Process_2026",
      "GO_Biological_Process_2025",
      "GO_Biological_Process_2021",
      "GO_Biological_Process_2013",
    ]);
  });
});
