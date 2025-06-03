<!--
 * @Date: 2025-06-03 14:18:58
 * @LastEditors: tianqitang1 Tianqi.Tang@ucsf.edu
 * @LastEditTime: 2025-06-03 14:34:14
 * @FilePath: /enrichr-mcp-server/README.md
-->
# Enrichr GO MCP Server

<div align="center">
  <img src="icon.svg" alt="Enrichr MCP Server Icon" width="128" height="128">
</div>

A Model Context Protocol (MCP) server that provides GO (Gene Ontology) enrichment analysis using the Enrichr API. This server queries Enrichr for GO Biological Process enrichment and returns only statistically significant results (p < 0.05) to reduce context usage.

## Features

- **GO Enrichment Analysis**: Query Enrichr for GO Biological Process 2025 enrichment
- **Significance Filtering**: Returns only terms with p < 0.05 to reduce noise
- **Detailed Results**: Provides p-values, z-scores, combined scores, and overlapping genes
- **Error Handling**: Robust error handling with informative messages

## Installation

1. Clone or download this server
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the server:
   ```bash
   npm run build
   ```

## Configuration

Add this server to your MCP client configuration (e.g., `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "enrichr-go-server": {
      "command": "node",
      "args": ["/absolute/path/to/enrichr-mcp-server/build/index.js"],
      "cwd": "/absolute/path/to/enrichr-mcp-server",
      "env": {}
    }
  }
}
```

## Usage

The server provides one tool:

### `query_enrichr_go_bp_tool`

Performs GO Biological Process enrichment analysis on a list of genes.

**Parameters:**
- `genes` (required): Array of gene symbols (e.g., ["TP53", "BRCA1", "EGFR"])
- `description` (optional): Description for the gene list (default: "Gene list for GO BP enrichment")

**Example:**
```json
{
  "name": "query_enrichr_go_bp_tool",
  "arguments": {
    "genes": ["TP53", "BRCA1", "EGFR"],
    "description": "Cancer-related genes"
  }
}
```

**Returns:**
Formatted text with significant GO terms including:
- Term name and GO ID
- P-value (scientific notation)
- Z-score
- Combined score
- Overlapping genes

## API Details

This server uses the Enrichr API:
- **Add List Endpoint**: `https://maayanlab.cloud/Enrichr/addList`
- **Enrichment Endpoint**: `https://maayanlab.cloud/Enrichr/enrich`
- **Library**: GO_Biological_Process_2025

## Development

- **Build**: `npm run build`
- **Watch**: `npm run watch` (rebuilds on file changes)
- **Inspector**: `npm run inspector` (debug with MCP inspector)

## Requirements

- Node.js 18+
- TypeScript 5.3+
- Internet connection for Enrichr API access

## License

This project follows the same license as the MCP TypeScript SDK.

## References

- [Enrichr](https://maayanlab.cloud/Enrichr/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
