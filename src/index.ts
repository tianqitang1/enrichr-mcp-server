#!/usr/bin/env node

/**
 * MCP Server for Enrichr GO Biological Process Enrichment Analysis
 * 
 * This server provides tools to query Enrichr for GO enrichment analysis,
 * returning only statistically significant results (p < 0.05) to reduce context usage.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { FormData } from "node-fetch";

const ENRICHR_URL = "https://maayanlab.cloud/Enrichr";

/**
 * Parse command line arguments and environment variables for configuration
 */
function parseConfig() {
  const args = process.argv.slice(2);
  const config = {
    defaultLibraries: ["GO_Biological_Process_2025"], // Default fallback
    serverName: "enrichr-server",
    version: "0.1.0",
    maxTermsPerLibrary: 10, // Default to 10 terms per library
    format: "detailed" as "detailed" | "compact" | "minimal" // Default to detailed format
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--libraries' || arg === '-l') {
      const librariesArg = args[i + 1];
      if (librariesArg) {
        config.defaultLibraries = librariesArg.split(',').map(lib => lib.trim());
        i++; // Skip next argument since we consumed it
      }
    } else if (arg === '--name' || arg === '-n') {
      const nameArg = args[i + 1];
      if (nameArg) {
        config.serverName = nameArg;
        i++;
      }
    } else if (arg === '--max-terms' || arg === '-m') {
      const maxTermsArg = args[i + 1];
      if (maxTermsArg) {
        const maxTerms = parseInt(maxTermsArg);
        if (!isNaN(maxTerms) && maxTerms > 0) {
          config.maxTermsPerLibrary = maxTerms;
        }
        i++;
      }
    } else if (arg === '--format' || arg === '-f') {
      const formatArg = args[i + 1];
      if (formatArg && ['detailed', 'compact', 'minimal'].includes(formatArg)) {
        config.format = formatArg as "detailed" | "compact" | "minimal";
        i++;
      }
    } else if (arg === '--compact' || arg === '-c') {
      config.format = "compact";
    } else if (arg === '--minimal') {
      config.format = "minimal";
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Enrichr MCP Server

Usage: enrichr-mcp-server [options]

Options:
  -l, --libraries <libs>    Comma-separated list of default Enrichr libraries
                           (default: GO_Biological_Process_2025)
  -n, --name <name>        Server name (default: enrichr-server)
  -m, --max-terms <num>    Maximum terms to show per library (default: 10)
  -f, --format <format>    Output format: detailed, compact, minimal (default: detailed)
  -c, --compact            Use compact format (same as --format compact)
      --minimal            Use minimal format (same as --format minimal)
  -h, --help              Show this help message

Format Options:
  detailed   - Full details: p-values, odds ratios, gene lists (default)
  compact    - Term name + p-value + gene count (saves ~50% context)
  minimal    - Just term name + p-value (saves ~80% context)

Environment Variables:
  ENRICHR_DEFAULT_LIBRARIES  Comma-separated list of default libraries
  ENRICHR_SERVER_NAME        Server name
  ENRICHR_MAX_TERMS          Maximum terms per library
  ENRICHR_FORMAT             Output format (detailed/compact/minimal)

Examples:
  enrichr-mcp-server --libraries "GO_Biological_Process_2025,KEGG_2021_Human"
  enrichr-mcp-server -l "MSigDB_Hallmark_2020" --max-terms 20 --compact
  enrichr-mcp-server --format minimal --max-terms 30
  enrichr-mcp-server --minimal --max-terms 50  # Ultra-compact for max coverage
  ENRICHR_DEFAULT_LIBRARIES="GO_Biological_Process_2025,Reactome_2022" enrichr-mcp-server

Popular Libraries:
  GO_Biological_Process_2025      - Gene Ontology Biological Processes
  GO_Molecular_Function_2025      - Gene Ontology Molecular Functions  
  GO_Cellular_Component_2025      - Gene Ontology Cellular Components
  KEGG_2021_Human                 - KEGG Pathways
  Reactome_2022                   - Reactome Pathways
  MSigDB_Hallmark_2020           - MSigDB Hallmark Gene Sets
  Human_Phenotype_Ontology        - Human Phenotype Ontology
  WikiPathways_2023_Human         - WikiPathways
  ChEA_2022                       - ChIP-seq Experiments
  GTEx_Tissue_Sample_Gene_Expression_Profiles_up - GTEx Tissue Expression
      `);
      process.exit(0);
    }
  }

  // Override with environment variables if set
  if (process.env.ENRICHR_DEFAULT_LIBRARIES) {
    config.defaultLibraries = process.env.ENRICHR_DEFAULT_LIBRARIES.split(',').map(lib => lib.trim());
  }
  
  if (process.env.ENRICHR_SERVER_NAME) {
    config.serverName = process.env.ENRICHR_SERVER_NAME;
  }

  if (process.env.ENRICHR_MAX_TERMS) {
    const maxTerms = parseInt(process.env.ENRICHR_MAX_TERMS);
    if (!isNaN(maxTerms) && maxTerms > 0) {
      config.maxTermsPerLibrary = maxTerms;
    }
  }

  if (process.env.ENRICHR_FORMAT) {
    const format = process.env.ENRICHR_FORMAT;
    if (['detailed', 'compact', 'minimal'].includes(format)) {
      config.format = format as "detailed" | "compact" | "minimal";
    }
  }

  return config;
}

// Parse configuration at startup
const CONFIG = parseConfig();

console.error(`🧬 Enrichr MCP Server starting...`);
console.error(`📚 Default libraries: ${CONFIG.defaultLibraries.join(', ')}`);
console.error(`🏷️  Server name: ${CONFIG.serverName}`);
console.error(`📊 Max terms per library: ${CONFIG.maxTermsPerLibrary}`);
console.error(`📝 Format: ${CONFIG.format}`);

/**
 * Interface for Enrichr enrichment results
 */
interface EnrichmentResult {
  total_terms: number;
  significant_terms: number;
  results: Array<[number, string, number, number, number, string[], number, any, any]>;
}

/**
 * Interface for Enrichr API error response
 */
interface EnrichmentError {
  error: string;
}

/**
 * Query Enrichr for enrichment results from specified library/libraries
 */
async function queryEnrichrLibraries(
  geneList: string[], 
  libraries: string[] = ["GO_Biological_Process_2025"], 
  description: string = "Gene list for enrichment"
): Promise<{ [library: string]: EnrichmentResult | EnrichmentError }> {
  const genesStr = geneList.join("\n");
  
  // 1. Add gene list to Enrichr
  const addListUrl = `${ENRICHR_URL}/addList`;
  const formData = new FormData();
  formData.append('list', genesStr);
  formData.append('description', description);

  try {
    const addResponse = await fetch(addListUrl, {
      method: 'POST',
      body: formData,
    });

    if (!addResponse.ok) {
      const error = { error: `HTTP error ${addResponse.status}: ${addResponse.statusText}` };
      return Object.fromEntries(libraries.map(lib => [lib, error]));
    }

    const addListData = await addResponse.json() as any;
    const userListId = addListData.userListId;
    
    if (!userListId) {
      const error = { error: `'userListId' not found in Enrichr's /addList response: ${JSON.stringify(addListData)}` };
      return Object.fromEntries(libraries.map(lib => [lib, error]));
    }

    // 2. Get enrichment results for each library
    const results: { [library: string]: EnrichmentResult | EnrichmentError } = {};
    
    for (const library of libraries) {
      const enrichUrl = `${ENRICHR_URL}/enrich`;
      const enrichParams = new URLSearchParams({
        userListId: userListId.toString(),
        backgroundType: library
      });

      try {
        const enrichResponse = await fetch(`${enrichUrl}?${enrichParams}`);
        
        if (!enrichResponse.ok) {
          results[library] = { error: `HTTP error ${enrichResponse.status}: ${enrichResponse.statusText}` };
          continue;
        }

        const enrichmentResults = await enrichResponse.json() as any;
        
        if (!(library in enrichmentResults)) {
          results[library] = { error: `Library '${library}' not found in results. Available: ${Object.keys(enrichmentResults).join(', ')}` };
          continue;
        }

        const allResults = enrichmentResults[library];
        
        // Filter for significant results using adjusted p-value (adjusted p < 0.05)
        const significantResults = allResults.filter((result: any[]) => result[6] < 0.05);
        
        results[library] = {
          total_terms: allResults.length,
          significant_terms: significantResults.length,
          results: significantResults
        };
      } catch (error) {
        results[library] = { error: `Error querying library ${library}: ${error instanceof Error ? error.message : String(error)}` };
      }
    }

    return results;

  } catch (error) {
    const errorResult = { error: `Error querying Enrichr: ${error instanceof Error ? error.message : String(error)}` };
    return Object.fromEntries(libraries.map(lib => [lib, errorResult]));
  }
}

/**
 * Format enrichment results for multiple libraries
 */
function formatMultiLibraryResults(
  results: { [library: string]: EnrichmentResult | EnrichmentError }, 
  maxTerms: number = CONFIG.maxTermsPerLibrary,
  format: "detailed" | "compact" | "minimal" = CONFIG.format
): string {
  const outputLines: string[] = [];
  
  for (const [library, result] of Object.entries(results)) {
    outputLines.push(`\n=== ${library} ===`);
    
    if ("error" in result) {
      outputLines.push(`Error: ${result.error}`);
      continue;
    }
    
    const { total_terms, significant_terms, results: libraryResults } = result;
    
    if (significant_terms === 0) {
      outputLines.push(`No significant terms found (adjusted p < 0.05) out of ${total_terms} total terms analyzed.`);
      continue;
    }
    
    const actualTermsShown = Math.min(significant_terms, maxTerms);
    
    outputLines.push(`Found ${significant_terms} significant terms (adjusted p < 0.05) out of ${total_terms} total terms:`);
    if (significant_terms > maxTerms) {
      outputLines.push(`Showing top ${actualTermsShown} terms (use --max-terms to show more):\n`);
    } else {
      outputLines.push('');
    }
    
    if (format === "compact") {
      // Compact format: more terms, less detail
      libraryResults.slice(0, maxTerms).forEach((termInfo, i) => {
        const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
        outputLines.push(`${i + 1}. ${termName} (adj-p: ${adjustedPValue.toExponential(2)}, genes: ${overlappingGenes.length})`);
      });
    } else if (format === "minimal") {
      // Minimal format: just term name and p-value
      libraryResults.slice(0, maxTerms).forEach((termInfo, i) => {
        const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
        outputLines.push(`${i + 1}. ${termName} (p: ${pValue.toExponential(2)})`);
      });
    } else {
      // Detailed format: fewer terms, more detail
      libraryResults.slice(0, maxTerms).forEach((termInfo, i) => {
        const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
        outputLines.push(`${i + 1}. ${termName}`);
        outputLines.push(`   Adjusted P-value: ${adjustedPValue.toExponential(2)}`);
        outputLines.push(`   Raw P-value: ${pValue.toExponential(2)}`);
        outputLines.push(`   Odds Ratio: ${oddsRatio.toFixed(2)}`);
        outputLines.push(`   Combined Score: ${combinedScore.toFixed(2)}`);
        outputLines.push(`   Overlapping Genes (${overlappingGenes.length}): ${overlappingGenes.join(', ')}`);
        outputLines.push("");
      });
    }
  }
  
  return outputLines.join("\n");
}

/**
 * Query Enrichr for GO Biological Process 2025 enrichment results
 */
async function queryEnrichrGoBp(geneList: string[], description: string = "Gene list for GO BP enrichment"): Promise<EnrichmentResult | EnrichmentError> {
  const genesStr = geneList.join("\n");
  
  // 1. Add gene list to Enrichr
  const addListUrl = `${ENRICHR_URL}/addList`;
  const formData = new FormData();
  formData.append('list', genesStr);
  formData.append('description', description);

  try {
    const addResponse = await fetch(addListUrl, {
      method: 'POST',
      body: formData,
    });

    if (!addResponse.ok) {
      return { error: `HTTP error ${addResponse.status}: ${addResponse.statusText}` };
    }

    const addListData = await addResponse.json() as any;
    const userListId = addListData.userListId;
    
    if (!userListId) {
      return { error: `'userListId' not found in Enrichr's /addList response: ${JSON.stringify(addListData)}` };
    }

    // 2. Get enrichment results
    const enrichUrl = `${ENRICHR_URL}/enrich`;
    const geneSetLibrary = "GO_Biological_Process_2025";
    
    const enrichParams = new URLSearchParams({
      userListId: userListId.toString(),
      backgroundType: geneSetLibrary
    });

    const enrichResponse = await fetch(`${enrichUrl}?${enrichParams}`);
    
    if (!enrichResponse.ok) {
      return { error: `HTTP error ${enrichResponse.status}: ${enrichResponse.statusText}` };
    }

    const enrichmentResults = await enrichResponse.json() as any;
    
    if (!(geneSetLibrary in enrichmentResults)) {
      return { error: `Library '${geneSetLibrary}' not found in results. Available: ${Object.keys(enrichmentResults).join(', ')}` };
    }

    const allResults = enrichmentResults[geneSetLibrary];
    
    // Filter for significant results using adjusted p-value (adjusted p < 0.05)
    // Result format: [rank, term_name, p_value, odds_ratio, combined_score, overlapping_genes, adjusted_p_value, old_p_value, old_adjusted_p_value]
    const significantResults = allResults.filter((result: any[]) => result[6] < 0.05);
    
    return {
      total_terms: allResults.length,
      significant_terms: significantResults.length,
      results: significantResults
    };

  } catch (error) {
    return { error: `Error querying Enrichr: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Format enrichment results for readable output
 */
function formatEnrichmentResults(
  resultsData: EnrichmentResult | EnrichmentError,
  maxTerms: number = CONFIG.maxTermsPerLibrary,
  format: "detailed" | "compact" | "minimal" = CONFIG.format
): string {
  if ("error" in resultsData) {
    return `Error: ${resultsData.error}`;
  }
  
  const { total_terms, significant_terms, results } = resultsData;
  
  if (significant_terms === 0) {
    return `No significant GO Biological Process terms found (adjusted p < 0.05) out of ${total_terms} total terms analyzed.`;
  }
  
  const actualTermsShown = Math.min(significant_terms, maxTerms);
  
  const outputLines = [
    `Found ${significant_terms} significant GO Biological Process terms (adjusted p < 0.05) out of ${total_terms} total terms:`
  ];
  
  if (significant_terms > maxTerms) {
    outputLines.push(`Showing top ${actualTermsShown} terms (use --max-terms to show more):\n`);
  } else {
    outputLines.push('');
  }
  
  if (format === "compact") {
    // Compact format
    results.slice(0, maxTerms).forEach((termInfo, i) => {
      const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
      outputLines.push(`${i + 1}. ${termName} (adj-p: ${adjustedPValue.toExponential(2)}, genes: ${overlappingGenes.length})`);
    });
  } else if (format === "minimal") {
    // Minimal format: just term name and p-value
    results.slice(0, maxTerms).forEach((termInfo, i) => {
      const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
      outputLines.push(`${i + 1}. ${termName} (p: ${pValue.toExponential(2)})`);
    });
  } else {
    // Detailed format
    results.slice(0, maxTerms).forEach((termInfo, i) => {
      const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
      outputLines.push(`${i + 1}. ${termName}`);
      outputLines.push(`   Adjusted P-value: ${adjustedPValue.toExponential(2)}`);
      outputLines.push(`   Raw P-value: ${pValue.toExponential(2)}`);
      outputLines.push(`   Odds Ratio: ${oddsRatio.toFixed(2)}`);
      outputLines.push(`   Combined Score: ${combinedScore.toFixed(2)}`);
      outputLines.push(`   Overlapping Genes (${overlappingGenes.length}): ${overlappingGenes.join(', ')}`);
      outputLines.push("");
    });
  }
  
  return outputLines.join("\n");
}

/**
 * Create an MCP server with capabilities for tools only (Enrichr GO enrichment)
 */
const server = new Server(
  {
    name: CONFIG.serverName,
    version: CONFIG.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes enrichment analysis tools with multi-library support.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "enrichr_analysis",
        description: "Perform gene set enrichment analysis using Enrichr with support for multiple gene set libraries. Use this tool when you need to: analyze gene functions, test enrichment across different databases, find biological processes/pathways/diseases, perform functional enrichment, analyze gene sets, identify overrepresented terms, run enrichment analysis, perform gene ontology analysis, test for enriched biological terms, or analyze gene list functionality across multiple databases. Returns only statistically significant terms (adjusted p < 0.05) to reduce context usage. Supports GO, pathways, disease, tissue, drug, and many other gene set libraries available in Enrichr.",
        inputSchema: {
          type: "object",
          properties: {
            genes: {
              type: "array",
              items: {
                type: "string"
              },
              description: "List of gene symbols to analyze for enrichment (e.g., ['TP53', 'BRCA1', 'EGFR'])"
            },
            libraries: {
              type: "array",
              items: {
                type: "string"
              },
              description: "List of Enrichr libraries to use for analysis. Common options include: 'GO_Biological_Process_2025', 'GO_Molecular_Function_2025', 'GO_Cellular_Component_2025', 'KEGG_2021_Human', 'Reactome_2022', 'WikiPathways_2023_Human', 'MSigDB_Hallmark_2020', 'Human_Phenotype_Ontology', 'GWAS_Catalog_2023', 'ChEA_2022', 'ENCODE_TF_ChIP-seq_2015', 'TargetScan_microRNA_2017'. Defaults to configured default libraries if not specified.",
              default: CONFIG.defaultLibraries
            },
            description: {
              type: "string",
              description: "Optional description for the gene list",
              default: "Gene list for enrichment analysis"
            },
            maxTerms: {
              type: "integer",
              description: "Maximum number of terms to show per library. Use higher values (20-50) to capture more biological insights, especially for libraries with many significant terms.",
              default: CONFIG.maxTermsPerLibrary,
              minimum: 1,
              maximum: 100
            },
            format: {
              type: "string",
              description: "Output format: detailed, compact, minimal",
              default: CONFIG.format,
              enum: ["detailed", "compact", "minimal"]
            }
          },
          required: ["genes"]
        }
      },
      {
        name: "query_enrichr_go_bp_tool",
        description: "Perform GO (Gene Ontology) enrichment analysis using Enrichr. Use this tool when you need to: analyze gene functions, test GO enrichment, find biological processes, perform functional enrichment, analyze gene sets, identify overrepresented pathways, run GO analysis, perform gene ontology analysis, test for enriched biological terms, or analyze gene list functionality. Returns only statistically significant terms (adjusted p < 0.05) to reduce context usage. Analyzes GO Biological Process 2025 database. For multi-library analysis, use enrichr_analysis instead.",
        inputSchema: {
          type: "object",
          properties: {
            genes: {
              type: "array",
              items: {
                type: "string"
              },
              description: "List of gene symbols to analyze for GO enrichment (e.g., ['TP53', 'BRCA1', 'EGFR'])"
            },
            description: {
              type: "string",
              description: "Optional description for the gene list",
              default: "Gene list for GO BP enrichment"
            }
          },
          required: ["genes"]
        }
      },
      {
        name: "go_enrichment", // Fallback tool name for more inclusive trigger words
        description: "Test genes for GO enrichment, analyze gene functions, or find enriched biological processes. Simple tool for functional analysis of gene lists. Same as query_enrichr_go_bp_tool but with a more intuitive name. Uses adjusted p-value < 0.05 for significance. For multi-library analysis, use enrichr_analysis instead.",
        inputSchema: {
          type: "object",
          properties: {
            genes: {
              type: "array",
              items: {
                type: "string"
              },
              description: "List of gene symbols to test for enrichment (e.g., ['TP53', 'BRCA1', 'EGFR'])"
            },
            description: {
              type: "string",
              description: "Optional description for the gene list",
              default: "Gene list for GO BP enrichment"
            }
          },
          required: ["genes"]
        }
      }
    ]
  };
});

/**
 * Handler for enrichment analysis tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "enrichr_analysis": {
      const genes = request.params.arguments?.genes as string[];
      const libraries = (request.params.arguments?.libraries as string[]) || CONFIG.defaultLibraries;
      const description = (request.params.arguments?.description as string) || "Gene list for enrichment analysis";
      const maxTerms = request.params.arguments?.maxTerms as number || CONFIG.maxTermsPerLibrary;
      const format = request.params.arguments?.format as "detailed" | "compact" | "minimal" || CONFIG.format;
      
      if (!genes) {
        return {
          content: [{
            type: "text",
            text: "Error: No genes provided. Please provide a list of gene symbols."
          }]
        };
      }
      
      if (!Array.isArray(genes) || !genes.every(gene => typeof gene === "string")) {
        return {
          content: [{
            type: "text",
            text: "Error: Genes must be provided as a list of strings (gene symbols)."
          }]
        };
      }
      
      if (!Array.isArray(libraries) || !libraries.every(lib => typeof lib === "string")) {
        return {
          content: [{
            type: "text",
            text: "Error: Libraries must be provided as a list of strings (library names)."
          }]
        };
      }
      
      if (genes.length < 2) {
        return {
          content: [{
            type: "text",
            text: "Warning: Enrichment analysis typically requires at least 2 genes for meaningful results."
          }]
        };
      }
      
      // Query multiple libraries
      const resultsData = await queryEnrichrLibraries(genes, libraries, description);
      const formattedResults = formatMultiLibraryResults(resultsData, maxTerms, format);
      
      return {
        content: [{
          type: "text",
          text: formattedResults
        }]
      };
    }

    case "query_enrichr_go_bp_tool":
    case "go_enrichment": {
      const genes = request.params.arguments?.genes as string[];
      const description = (request.params.arguments?.description as string) || "Gene list for GO BP enrichment";
      
      if (!genes) {
        return {
          content: [{
            type: "text",
            text: "Error: No genes provided. Please provide a list of gene symbols."
          }]
        };
      }
      
      if (!Array.isArray(genes) || !genes.every(gene => typeof gene === "string")) {
        return {
          content: [{
            type: "text",
            text: "Error: Genes must be provided as a list of strings (gene symbols)."
          }]
        };
      }
      
      if (genes.length < 2) {
        return {
          content: [{
            type: "text",
            text: "Warning: GO enrichment analysis typically requires at least 2 genes for meaningful results."
          }]
        };
      }
      
      // Query single library (backward compatibility)
      const resultsData = await queryEnrichrGoBp(genes, description);
      const formattedResults = formatEnrichmentResults(resultsData, CONFIG.maxTermsPerLibrary, CONFIG.format);
      
      return {
        content: [{
          type: "text",
          text: formattedResults
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
