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
function formatEnrichmentResults(resultsData: EnrichmentResult | EnrichmentError): string {
  if ("error" in resultsData) {
    return `Error: ${resultsData.error}`;
  }
  
  const { total_terms, significant_terms, results } = resultsData;
  
  if (significant_terms === 0) {
    return `No significant GO Biological Process terms found (adjusted p < 0.05) out of ${total_terms} total terms analyzed.`;
  }
  
  const outputLines = [
    `Found ${significant_terms} significant GO Biological Process terms (adjusted p < 0.05) out of ${total_terms} total terms:\n`
  ];
  
  results.forEach((termInfo, i) => {
    // termInfo format: [rank, term_name, p_value, odds_ratio, combined_score, overlapping_genes, adjusted_p_value, old_p_value, old_adjusted_p_value]
    const [rank, termName, pValue, oddsRatio, combinedScore, overlappingGenes, adjustedPValue] = termInfo;
    outputLines.push(`${i + 1}. ${termName}`);
    outputLines.push(`   Adjusted P-value: ${adjustedPValue.toExponential(2)}`);
    outputLines.push(`   Raw P-value: ${pValue.toExponential(2)}`);
    outputLines.push(`   Odds Ratio: ${oddsRatio.toFixed(2)}`);
    outputLines.push(`   Combined Score: ${combinedScore.toFixed(2)}`);
    outputLines.push(`   Overlapping Genes (${overlappingGenes.length}): ${overlappingGenes.join(', ')}`);
    outputLines.push("");
  });
  
  return outputLines.join("\n");
}

/**
 * Create an MCP server with capabilities for tools only (Enrichr GO enrichment)
 */
const server = new Server(
  {
    name: "enrichr-go-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "query_enrichr_go_bp_tool" tool for GO enrichment analysis.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_enrichr_go_bp_tool",
        description: "Perform GO (Gene Ontology) enrichment analysis using Enrichr. Use this tool when you need to: analyze gene functions, test GO enrichment, find biological processes, perform functional enrichment, analyze gene sets, identify overrepresented pathways, run GO analysis, perform gene ontology analysis, test for enriched biological terms, or analyze gene list functionality. Returns only statistically significant terms (adjusted p < 0.05) to reduce context usage. Analyzes GO Biological Process 2025 database.",
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
        name: "go_enrichment",
        description: "Test genes for GO enrichment, analyze gene functions, or find enriched biological processes. Simple tool for functional analysis of gene lists. Same as query_enrichr_go_bp_tool but with a more intuitive name. Uses adjusted p-value < 0.05 for significance.",
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
 * Handler for the query_enrichr_go_bp_tool.
 * Queries Enrichr for GO enrichment and returns formatted significant results.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
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
      
      // Query Enrichr
      const resultsData = await queryEnrichrGoBp(genes, description);
      const formattedResults = formatEnrichmentResults(resultsData);
      
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
