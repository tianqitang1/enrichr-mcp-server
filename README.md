<!--
 * @Date: 2025-06-03 14:18:58
 * @LastEditors: tianqitang1 Tianqi.Tang@ucsf.edu
 * @LastEditTime: 2025-06-03 16:25:27
 * @FilePath: /enrichr-mcp-server/README.md
-->
# Enrichr MCP Server

<div align="center">
  <img src="icon.svg" alt="Enrichr MCP Server Icon" width="128" height="128">
</div>

A Model Context Protocol (MCP) server that provides gene set enrichment analysis using the [Enrichr](https://maayanlab.cloud/Enrichr/) API. This server supports multiple gene set libraries from Enrichr and returns only statistically significant results (p < 0.05) to reduce context usage.

## Features

- **Multi-Library Enrichment Analysis**: Query multiple Enrichr libraries simultaneously (GO, pathways, diseases, tissues, drugs, etc.)
- **GO Enrichment Analysis**: Specialized tools for GO Biological Process enrichment analysis
- **Comprehensive Library Support**: Access to hundreds of gene set libraries including:
  - Gene Ontology (Biological Process, Molecular Function, Cellular Component)
  - Pathway databases (KEGG, Reactome, WikiPathways, BioCarta, MSigDB)
  - Disease/Phenotype databases (Human Phenotype Ontology, GWAS Catalog)
  - Tissue/Cell type libraries (GTEx, Human Cell Atlas, ARCHS4)
  - Drug/Chemical libraries (DrugMatrix, L1000, TG-GATEs)
  - Transcription Factor targets (ChEA, ENCODE)
  - MicroRNA targets (TargetScan, miRTarBase)
- **Significance Filtering**: Returns only terms with adjusted p < 0.05 to reduce noise
- **Detailed Results**: Provides p-values, z-scores, combined scores, and overlapping genes
- **Error Handling**: Robust error handling with informative messages

## Configuration

### MCP Client Configuration

Add this server to your MCP client configuration (e.g., `.cursor/mcp.json`):

#### Basic Configuration (GO Biological Process only)
```json
{
  "mcpServers": {
    "enrichr-server": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server"]
    }
  }
}
```

#### Custom Default Libraries Configuration

You can configure default libraries using CLI arguments in your MCP configuration:

```json
{
  "mcpServers": {
    "enrichr-go-only": {
      "command": "npx", 
      "args": ["-y", "enrichr-mcp-server", "--libraries", "GO_Biological_Process_2025"]
    },
    "enrichr-pathways": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,KEGG_2021_Human,Reactome_2022"]
    },
    "enrichr-disease": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "--libraries", "Human_Phenotype_Ontology,OMIM_Disease,ClinVar_2019"]
    }
  }
}
```

#### Environment Variables Configuration

Alternatively, use environment variables:

```json
{
  "mcpServers": {
    "enrichr-server": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server"],
      "env": {
        "ENRICHR_DEFAULT_LIBRARIES": "GO_Biological_Process_2025,KEGG_2021_Human",
        "ENRICHR_SERVER_NAME": "my-enrichr-server"
      }
    }
  }
}
```

### Command Line Options

```bash
# Show help
npx enrichr-mcp-server --help

# Use only GO Biological Process
npx enrichr-mcp-server --libraries "GO_Biological_Process_2025"

# Use multiple libraries (comma-separated)  
npx enrichr-mcp-server -l "GO_Biological_Process_2025,KEGG_2021_Human,MSigDB_Hallmark_2020"

# Set custom server name
npx enrichr-mcp-server --name "my-enrichr-server"
```

### Environment Variables

- `ENRICHR_DEFAULT_LIBRARIES`: Comma-separated list of default libraries
- `ENRICHR_SERVER_NAME`: Custom server name

### Benefits of Default Library Configuration

1. **Simplified Tool Calls**: When libraries aren't specified in tool calls, your configured defaults are used
2. **Consistent Results**: Ensures consistent library usage across different queries
3. **Multiple Configurations**: Set up different MCP server instances for different research contexts
4. **Override Capability**: Individual tool calls can still specify different libraries when needed

## Usage

The server provides three tools:

### `enrichr_analysis` (Recommended for multi-library analysis)

Performs enrichment analysis across multiple specified Enrichr libraries.

**Parameters:**
- `genes` (required): Array of gene symbols (e.g., ["TP53", "BRCA1", "EGFR"])
- `libraries` (optional): Array of Enrichr library names to query (defaults to ["GO_Biological_Process_2025"])
- `description` (optional): Description for the gene list (default: "Gene list for enrichment analysis")

**Popular Libraries:**
- **Gene Ontology**: `GO_Biological_Process_2025`, `GO_Molecular_Function_2025`, `GO_Cellular_Component_2025`
- **Pathways**: `KEGG_2021_Human`, `Reactome_2022`, `WikiPathways_2023_Human`, `MSigDB_Hallmark_2020`
- **Disease/Phenotype**: `Human_Phenotype_Ontology`, `GWAS_Catalog_2023`, `ClinVar_2019`
- **Tissue/Cell Types**: `GTEx_Tissue_Sample_Gene_Expression_Profiles_up`, `Human_Gene_Atlas`, `ARCHS4_Tissues`
- **Transcription Factors**: `ChEA_2022`, `ENCODE_TF_ChIP-seq_2015`, `TRANSFAC_and_JASPAR_PWMs`
- **MicroRNA**: `TargetScan_microRNA_2017`, `miRTarBase_2017`
- **Drugs**: `DrugMatrix`, `L1000_Kinase_and_GPCR_Perturbations_up`, `TG_GATEs_2019`

**Example:**
```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["TP53", "BRCA1", "EGFR", "MYC", "AKT1"],
    "libraries": [
      "GO_Biological_Process_2025",
      "KEGG_2021_Human", 
      "MSigDB_Hallmark_2020",
      "Human_Phenotype_Ontology"
    ],
    "description": "Cancer-related genes"
  }
}
```

### `query_enrichr_go_bp_tool`

Performs GO Biological Process enrichment analysis (legacy tool for backward compatibility).

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

### `go_enrichment`

Alternative name for `query_enrichr_go_bp_tool` with more intuitive naming.

**Returns:**
All tools return formatted text with significant terms including:
- Library name and summary statistics
- Term name and identifier
- Adjusted P-value and raw P-value (scientific notation)
- Odds ratio and combined score
- Overlapping genes with counts

## Available Library Categories

Enrichr contains hundreds of gene set libraries organized into categories:

- **Gene Ontology**: Biological processes, molecular functions, cellular components
- **Pathways**: KEGG, Reactome, WikiPathways, BioCarta, NCI, HumanCyc, Panther
- **Disease/Phenotype**: HPO, OMIM, ClinVar, GWAS Catalog, DisGeNET
- **Tissues/Cell Types**: GTEx, Human Cell Atlas, ARCHS4, Mouse Gene Atlas
- **Transcription Factors**: ChEA, ENCODE, TRANSFAC, JASPAR
- **MicroRNA Targets**: TargetScan, miRTarBase, microRNA.org
- **Drug/Chemical**: DrugMatrix, L1000, TG-GATEs, CTD
- **Protein Interactions**: BioGRID, STRING, hu.MAP
- **Literature Mining**: PubMed, Geneshot, Co-expression
- **Evolutionary**: Cross-species homologs, phylogenetic profiles

For a complete list of available libraries, visit the [Enrichr Libraries page](https://maayanlab.cloud/Enrichr/#libraries).

## API Details

This server uses the Enrichr API:
- **Add List Endpoint**: `https://maayanlab.cloud/Enrichr/addList`
- **Enrichment Endpoint**: `https://maayanlab.cloud/Enrichr/enrich`
- **Supported Libraries**: All libraries available through Enrichr web interface

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

- Chen EY, Tan CM, Kou Y, Duan Q, Wang Z, Meirelles GV, Clark NR, Ma'ayan A. Enrichr: interactive and collaborative HTML5 gene list enrichment analysis tool. BMC Bioinformatics. 2013; 128(14).

- Kuleshov MV, Jones MR, Rouillard AD, Fernandez NF, Duan Q, Wang Z, Koplev S, Jenkins SL, Jagodnik KM, Lachmann A, McDermott MG, Monteiro CD, Gundersen GW, Ma'ayan A. Enrichr: a comprehensive gene set enrichment analysis web server 2016 update. Nucleic Acids Research. 2016; gkw377.

- Xie Z, Bailey A, Kuleshov MV, Clarke DJB., Evangelista JE, Jenkins SL, Lachmann A, Wojciechowicz ML, Kropiwnicki E, Jagodnik KM, Jeon M, & Ma'ayan A. Gene set knowledge discovery with Enrichr. Current Protocols, 1, e90. 2021. doi: 10.1002/cpz1.90

- [Enrichr](https://maayanlab.cloud/Enrichr/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
