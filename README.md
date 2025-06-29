<!--
 * @Author: tianqitang1 Tianqi.Tang@ucsf.edu
 * @Date: 2025-06-03 14:18:58
 * @LastEditors: tianqitang1 Tianqi.Tang@ucsf.edu
 * @LastEditTime: 2025-06-29 06:36:31
 * @FilePath: /enrichr-mcp-server/README.md
-->
# Enrichr MCP Server

<div align="center">
  <img src="icon.svg" alt="Enrichr MCP Server Icon" width="128" height="128">
</div>

A Model Context Protocol (MCP) server that provides gene set enrichment analysis using the [Enrichr](https://maayanlab.cloud/Enrichr/) API. This server supports all available gene set libraries from Enrichr and returns only statistically significant results (corrected-$p$ < 0.05) for LLM tools to interpret.

## Installation

For Claude Desktop, please download the [Desktop Extension](https://github.com/tianqitang1/enrichr-mcp-server/releases/latest) and install it by clicking `☰ (top left) -> File -> Settings` and drag and drop the downloaded file into the `Settings` window.

Use the button below to install the MCP server to Cursor, VS Code, or VS Code Insiders with default settings.

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=enrichr-mcp-server&config=eyJjb21tYW5kIjoibnB4IC15IGVucmljaHItbWNwLXNlcnZlciAtLWNvbXBhY3QgLS1tYXgtdGVybXMgMTAwIn0%3D)
[![Add to VS Code](https://img.shields.io/badge/Add_to_VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22enrichr-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22enrichr-mcp-server%22%2C%22--compact%22%2C%22--max-terms%22%2C%22100%22%5D%7D)
[![Add to VS Code Insiders](https://img.shields.io/badge/Add_to_VS_Code_Insiders-24bfa5?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode-insiders:mcp/install?%7B%22name%22%3A%22enrichr-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22enrichr-mcp-server%22%2C%22--compact%22%2C%22--max-terms%22%2C%22100%22%5D%7D)


For Claude Code, use the following command:
```bash
claude mcp add enrichr-mcp-server -- npx -y enrichr-mcp-server
```

## Features

- **Multi-Library Enrichment Analysis**: Query multiple Enrichr libraries simultaneously (GO, pathways, diseases, tissues, drugs, etc.)
- **Comprehensive Library Support**: Access to hundreds of gene set libraries from Enrichr including:
  - Gene Ontology (Biological Process, Molecular Function, Cellular Component)
  - Pathway databases (KEGG, Reactome, WikiPathways, BioCarta, MSigDB)
  - Disease/Phenotype databases (Human Phenotype Ontology, GWAS Catalog)
  - Tissue/Cell type libraries (GTEx, Human Cell Atlas, ARCHS4)
  - Drug/Chemical libraries (DrugMatrix, L1000, TG-GATEs)
  - Transcription Factor targets (ChEA, ENCODE)
  - MicroRNA targets (TargetScan, miRTarBase)
- **GO Enrichment Analysis**: Specialized tool for GO Biological Process enrichment analysis (I use this a lot, so I made it a tool)


## Configuration

### MCP Client Configuration

Add this server to your MCP client configuration (e.g., `.cursor/mcp.json`):

#### Basic Configuration (Popular Libraries by Default)
With the default configuration the server will query a curated list of popular libraries.
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

#### Custom Available Libraries Configuration

You can configure libraries that are available for the LLM to use using CLI arguments in your MCP configuration:

```json
{
  "mcpServers": {
    "enrichr-popular": {
      "command": "npx", 
      "args": ["-y", "enrichr-mcp-server", "--libraries", "pop"]
    }, // This will make the most popular libraries available to the LLM, namely GO_Biological_Process_2025, KEGG_2021_Human, Reactome_2022, MSigDB_Hallmark_2020, ChEA_2022, GWAS_Catalog_2023, Human_Phenotype_Ontology, STRING_Interactions_2023, DrugBank_2022, CellMarker_2024
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

### Command Line Options

Adjust the CLI options to your needs, unreasonable settings might exceed the context window of the LLM and confuse it, so choose wisely:

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--libraries <libs>` | `-l` | Comma-separated list of Enrichr libraries to query | `pop` |
| `--max-terms <num>` | `-m` | Maximum terms to show per library | `50` |
| `--format <format>` | `-f` | Output format: `detailed`, `compact`, `minimal` | `detailed` |
| `--output <file>` | `-o` | Save complete results to TSV file | _(none)_ |
| `--compact` | `-c` | Use compact format (same as `--format compact`) | _(flag)_ |
| `--minimal` | | Use minimal format (same as `--format minimal`) | _(flag)_ |
| `--help` | `-h` | Show help message | _(flag)_ |

#### Format Options
- **`detailed`**: Full details including p-values, odds ratios, and gene lists (default)
- **`compact`**: Term name + p-value + gene count (saves ~50% tokens)
- **`minimal`**: Just term name + p-value (saves ~80% tokens)

#### Examples

For a full list of commands, options, and usage examples, run the server with the `--help` flag. This is the most up-to-date source of information.

```bash
# Show the help message
npx enrichr-mcp-server --help
```

### Environment Variables

You can also configure the server via environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `ENRICHR_LIBRARIES` | Comma-separated list of libraries to query | `GO_Biological_Process_2025,KEGG_2021_Human` |
| `ENRICHR_MAX_TERMS` | Maximum terms per library | `20` |
| `ENRICHR_FORMAT` | Output format (`detailed`/`compact`/`minimal`) | `compact` |
| `ENRICHR_OUTPUT_FILE` | TSV output file path | `/tmp/enrichr_results.tsv` |

**Note**: CLI arguments take precedence over environment variables when both are specified.


### Popular Libraries

This table lists the libraries included when using the `-l pop` flag.

| Library | Description |
|---------|-------------|
| `GO_Biological_Process_2025` | Gene Ontology terms describing biological objectives accomplished by gene products. |
| `KEGG_2021_Human` | Metabolic and signaling pathways from Kyoto Encyclopedia of Genes and Genomes for human. |
| `Reactome_2022` | Curated and peer-reviewed pathways from Reactome covering signaling, metabolism, gene expression, and disease. |
| `MSigDB_Hallmark_2020` | Hallmark gene sets representing well-defined biological states and processes from MSigDB. |
| `ChEA_2022` | ChIP-seq experiments from GEO, ENCODE, and publications identifying transcription factor-gene interactions from human and mouse. |
| `GWAS_Catalog_2023` | Genome-wide association study results from NHGRI-EBI GWAS Catalog linking genes to traits. |
| `Human_Phenotype_Ontology` | Standardized vocabulary of phenotypic abnormalities associated with human diseases. |
| `STRING_Interactions_2023` | Protein interactions from STRING database including experimental and predicted. |
| `DrugBank_2022` | Drug targets from DrugBank including approved drugs and experimental compounds. |
| `CellMarker_2024` | Manually curated cell type markers from CellMarker database for human and mouse. |

For a complete list of available libraries, visit the [Enrichr Libraries page](https://maayanlab.cloud/Enrichr/#libraries).

### Benefits of Library Configuration

1. **Simplified Tool Calls**: When libraries aren't specified in tool calls, your configured libraries are used
2. **Consistent Results**: Ensures consistent library usage across different queries  
3. **Multiple Configurations**: Set up different MCP server instances for different research contexts
4. **Override Capability**: Individual tool calls can still specify different libraries when needed

## Usage

The server provides two tools:

### `enrichr_analysis` (Recommended for multi-library analysis)

Performs enrichment analysis across multiple specified Enrichr libraries.

**Parameters:**
- `genes` (required): Array of gene symbols (e.g., ["TP53", "BRCA1", "EGFR"])
- `libraries` (optional): Array of Enrichr library names to query (defaults to configured libraries)
- `description` (optional): Description for the gene list (default: "Gene list for enrichment analysis")
- `maxTerms` (optional): Maximum number of terms to show per library (default: 50)
- `format` (optional): Output format: `detailed`, `compact`, `minimal` (default: `detailed`)
- `outputFile` (optional): Path to save complete results as TSV file

### `go_bp_enrichment` 

Performs Gene Ontology (GO) Biological Process enrichment analysis to understand biological functions and processes overrepresented in your gene list. Perfect for interpreting gene expression data, identifying significant biological processes, and uncovering functional implications of genes from RNA-seq, microarray, or other high-throughput experiments.

**Parameters:**
- `genes` (required): Array of gene symbols (e.g., ["TP53", "BRCA1", "EGFR"])
- `description` (optional): Description for the gene list (default: "Gene list for GO BP enrichment")
- `outputFile` (optional): Path to save complete results as TSV file

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
