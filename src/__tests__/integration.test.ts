import { describe, it, expect } from "vitest";
import { queryEnrichrLibraries } from "../index.js";

/**
 * Integration tests that hit the real Enrichr API.
 * Skipped in CI environments.
 */
describe.skipIf(!!process.env.CI)("Enrichr API integration", () => {
  const testGenes = ["TP53", "BRCA1", "BRCA2"];

  it("returns results for a known gene set", async () => {
    const results = await queryEnrichrLibraries(
      testGenes,
      ["GO_Biological_Process_2025"],
      "integration test"
    );

    expect(results).toHaveProperty("GO_Biological_Process_2025");
    const libResult = results["GO_Biological_Process_2025"];

    // Should not be an error
    expect(libResult).not.toHaveProperty("error");

    // Type narrow
    if ("error" in libResult) throw new Error("unexpected error");

    expect(libResult.totalTerms).toBeGreaterThan(0);
    expect(libResult.significantTerms).toBeGreaterThan(0);
    expect(libResult.terms.length).toBeGreaterThan(0);

    // Verify term shape
    const firstTerm = libResult.terms[0];
    expect(firstTerm).toHaveProperty("rank");
    expect(firstTerm).toHaveProperty("termName");
    expect(firstTerm).toHaveProperty("pValue");
    expect(firstTerm).toHaveProperty("adjustedPValue");
    expect(firstTerm).toHaveProperty("overlappingGenes");
    expect(firstTerm.adjustedPValue).toBeLessThan(0.05);
  });

  it("queries multiple libraries in parallel", async () => {
    const results = await queryEnrichrLibraries(
      testGenes,
      ["GO_Biological_Process_2025", "KEGG_2021_Human"],
      "multi-library test"
    );

    expect(Object.keys(results)).toHaveLength(2);
    expect(results).toHaveProperty("GO_Biological_Process_2025");
    expect(results).toHaveProperty("KEGG_2021_Human");
  });

  it("handles invalid library name gracefully", async () => {
    const results = await queryEnrichrLibraries(
      testGenes,
      ["NONEXISTENT_LIBRARY_XYZ"],
      "invalid library test"
    );

    const libResult = results["NONEXISTENT_LIBRARY_XYZ"];
    expect(libResult).toHaveProperty("error");
  });
});
