# Enrichr MCP Server

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/tianqitang1/enrichr-mcp-server)](https://archestra.ai/mcp-catalog/tianqitang1__enrichr-mcp-server)
<div align="center">
  <img src="icon.svg" alt="Enrichr MCP Server Icon" width="128" height="128">
</div>

A Model Context Protocol (MCP) server that provides gene set enrichment analysis using the [Enrichr](https://maayanlab.cloud/Enrichr/) API. This server supports all available gene set libraries from Enrichr and returns only statistically significant results (corrected-$p$ < 0.05) for LLM tools to interpret.

[![Smithery](https://smithery.ai/badge/enrichr-mcp-server)](https://smithery.ai/server/enrichr-mcp-server)

## Installation

### Claude Desktop

Download the latest [MCPB bundle](https://github.com/tianqitang1/enrichr-mcp-server/releases/latest) (`.mcpb` file) and install it via `☰ (top left) -> File -> Settings`, then drag and drop the file into the Settings window.

### Cursor / VS Code

Use the buttons below to install with default settings:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=enrichr-mcp-server&config=eyJjb21tYW5kIjoibnB4IC15IGVucmljaHItbWNwLXNlcnZlciAtLWNvbXBhY3QgLS1tYXgtdGVybXMgMTAwIn0%3D)
[![Add to VS Code](https://img.shields.io/badge/Add_to_VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode%3Amcp/install%3F%257B%2522name%2522%253A%2522enrichr-mcp-server%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522enrichr-mcp-server%2522%252C%2522--compact%2522%252C%2522--max-terms%2522%252C%2522100%2522%255D%257D)
[![Add to VS Code Insiders](https://img.shields.io/badge/Add_to_VS_Code_Insiders-24bfa5?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode-insiders%3Amcp/install%3F%257B%2522name%2522%253A%2522enrichr-mcp-server%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522enrichr-mcp-server%2522%252C%2522--compact%2522%252C%2522--max-terms%2522%252C%2522100%2522%255D%257D)

### Claude Code

```bash
claude mcp add enrichr-mcp-server -- npx -y enrichr-mcp-server
```

Or install as a Claude Code plugin:
```bash
/plugin install enrichr-mcp-server
```

### Smithery

```bash
npx -y @smithery/cli install enrichr-mcp-server --client claude
```

### Manual Configuration

Add to your MCP client config (e.g., `.cursor/mcp.json`):

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

## Features

- **Two Tools**: `enrichr_analysis` for running enrichment, `suggest_libraries` for discovering relevant libraries
- **Library Catalog**: Browse 200+ libraries by category via MCP resources
- **Guided Workflow**: `enrichment_analysis` prompt for end-to-end analysis with interpretation
- **22 Library Categories**: Programmatic category mapping for all libraries (pathways, cancer, kinases, etc.)
- **Parallel Library Queries**: All libraries queried in parallel for fast multi-database analysis
- **Structured Output**: Returns both human-readable text and structured JSON for programmatic use
- **Configurable Output Formats**: Detailed, compact, or minimal to manage token usage
- **TSV Export**: Save complete results to TSV files

## Tools

### `suggest_libraries`

Discover the most relevant Enrichr libraries for a research question. Use this before `enrichr_analysis` to pick the best libraries for your specific topic. **No network call needed** — searches locally across all library names and descriptions.

**Parameters:**
- `query` (required): Research context (e.g., "DNA repair", "breast cancer drug resistance")
- `category` (optional): Filter by category (e.g., `cancer`, `pathways`, `kinases`)
- `maxResults` (optional): Max results to return (default: 10, max: 50)

**Returns:**
- Ranked list of libraries with relevance scores, categories, and descriptions
- Structured JSON with suggestions array

### `enrichr_analysis`

Perform enrichment analysis across multiple Enrichr libraries in parallel.

**Parameters:**
- `genes` (required): Array of gene symbols (e.g., `["TP53", "BRCA1", "EGFR"]`) — minimum 2
- `libraries` (optional): Array of Enrichr library names to query (defaults to configured libraries)
- `description` (optional): Description for the gene list
- `maxTerms` (optional): Maximum terms per library (default: 50)
- `format` (optional): Output format: `detailed`, `compact`, `minimal`
- `outputFile` (optional): Path to save complete results as TSV file

**Returns:**
- Text content with formatted significant terms (name, p-values, odds ratio, combined score, overlapping genes)
- Structured JSON output with full result data

## Resources

| URI | Description |
|-----|-------------|
| `enrichr://libraries` | Full library catalog organized by category |
| `enrichr://libraries/{category}` | Libraries for a specific category (e.g., `enrichr://libraries/cancer`) |

## Prompts

### `enrichment_analysis`

Guided workflow for gene set enrichment analysis. Accepts a gene list and optional research context, then walks through library selection, analysis, and interpretation.

**Arguments:**
- `genes` (required): Gene symbols, comma or newline separated
- `context` (optional): Research context for library selection (triggers `suggest_libraries` step)

## Library Categories

All 200+ libraries are organized into 22 categories:

| Category | Examples |
|----------|----------|
| `transcription` | ChEA_2022, ENCODE_TF_ChIP-seq_2015, TRANSFAC_and_JASPAR_PWMs |
| `pathways` | KEGG_2021_Human, Reactome_2022, WikiPathways_2023_Human, MSigDB_Hallmark_2020 |
| `ontologies` | GO_Biological_Process_2025, GO_Molecular_Function_2025, Human_Phenotype_Ontology |
| `diseases_drugs` | GWAS_Catalog_2023, DrugBank_2022, OMIM_Disease, DisGeNET |
| `cell_types` | GTEx_Tissue_Expression_Up, CellMarker_2024, Tabula_Sapiens |
| `microRNAs` | TargetScan_microRNA_2017, miRTarBase_2022, MiRDB_2019 |
| `epigenetics` | Epigenomics_Roadmap_HM_ChIP-seq, JASPAR_2022, Cistrome_2023 |
| `kinases` | KEA_2015, PhosphoSitePlus_2023, PTMsigDB_2023 |
| `gene_perturbations` | LINCS_L1000_CRISPR_KO_Consensus_Sigs, CRISPR_GenomeWide_2023 |
| `metabolomics` | HMDB_Metabolites, Metabolomics_Workbench_2023, SMPDB_2023 |
| `aging` | Aging_Perturbations_from_GEO_down, GenAge_2023, Longevity_Map_2023 |
| `protein_families` | InterPro_Domains_2019, Pfam_Domains_2019, UniProt_Keywords_2023 |
| `computational` | Enrichr_Submissions_TF-Gene_Coocurrence, ARCHS4_TF_Coexp |
| `literature` | Rummagene_signatures, AutoRIF, GeneRIF |
| `cancer` | COSMIC_Cancer_Gene_Census, TCGA_Mutations_2023, OncoKB_2023, GDSC_2023 |
| `single_cell` | Human_Cell_Landscape, scRNAseq_Datasets_2023, SingleCellSignatures_2023 |
| `chromosome` | Chromosome_Location, Chromosome_Location_hg19 |
| `protein_interactions` | STRING_Interactions_2023, BioGRID_2023, IntAct_2023, MINT_2023 |
| `structural` | PDB_Structural_Annotations, AlphaFold_2023 |
| `immunology` | ImmuneSigDB, ImmPort_2023, Immunological_Signatures_MSigDB |
| `development` | ESCAPE, Developmental_Signatures_2023 |
| `other` | MSigDB_Computational, HGNC_Gene_Families, Open_Targets_2023 |

Use `suggest_libraries` to search across all categories, or read `enrichr://libraries/{category}` for the full list in any category.

## Configuration

### Command Line Options

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

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENRICHR_LIBRARIES` | Comma-separated list of libraries | `GO_Biological_Process_2025,KEGG_2021_Human` |
| `ENRICHR_MAX_TERMS` | Maximum terms per library | `20` |
| `ENRICHR_FORMAT` | Output format | `compact` |
| `ENRICHR_OUTPUT_FILE` | TSV output file path | `/tmp/enrichr_results.tsv` |

**Note**: CLI arguments take precedence over environment variables.

### Multiple Server Instances

Set up different instances for different research contexts:

```json
{
  "mcpServers": {
    "enrichr-pathways": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,KEGG_2021_Human,Reactome_2022"]
    },
    "enrichr-disease": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "Human_Phenotype_Ontology,OMIM_Disease,ClinVar_2019"]
    }
  }
}
```

### Popular Libraries (Default)

When using the default `-l pop` configuration:

| Library | Description |
|---------|-------------|
| `GO_Biological_Process_2025` | Gene Ontology terms describing biological objectives accomplished by gene products. |
| `KEGG_2021_Human` | Metabolic and signaling pathways from KEGG for human. |
| `Reactome_2022` | Curated and peer-reviewed pathways covering signaling, metabolism, and disease. |
| `MSigDB_Hallmark_2020` | Hallmark gene sets representing well-defined biological states and processes. |
| `ChEA_2022` | ChIP-seq experiments identifying transcription factor-gene interactions. |
| `GWAS_Catalog_2023` | Genome-wide association study results linking genes to traits. |
| `Human_Phenotype_Ontology` | Standardized vocabulary of phenotypic abnormalities associated with human diseases. |
| `STRING_Interactions_2023` | Protein interactions from STRING including experimental and predicted. |
| `DrugBank_2022` | Drug targets from DrugBank including approved and experimental compounds. |
| `CellMarker_2024` | Manually curated cell type markers for human and mouse. |

## API Details

This server uses the Enrichr API:
- **Add List Endpoint**: `https://maayanlab.cloud/Enrichr/addList`
- **Enrichment Endpoint**: `https://maayanlab.cloud/Enrichr/enrich`
- **Supported Libraries**: All libraries available through the [Enrichr web interface](https://maayanlab.cloud/Enrichr/#libraries)

## Development

```bash
npm run build          # Build TypeScript
npm test               # Run tests (unit + integration + MCP protocol)
npm run test:watch     # Run tests in watch mode
npm run watch          # Auto-rebuild on file changes
npm run inspector      # Debug with MCP inspector
```

## Requirements

- Node.js 18+
- Internet connection for Enrichr API access

## License

MIT

## References

- Chen EY, Tan CM, Kou Y, Duan Q, Wang Z, Meirelles GV, Clark NR, Ma'ayan A. Enrichr: interactive and collaborative HTML5 gene list enrichment analysis tool. BMC Bioinformatics. 2013; 128(14).

- Kuleshov MV, Jones MR, Rouillard AD, Fernandez NF, Duan Q, Wang Z, Koplev S, Jenkins SL, Jagodnik KM, Lachmann A, McDermott MG, Monteiro CD, Gundersen GW, Ma'ayan A. Enrichr: a comprehensive gene set enrichment analysis web server 2016 update. Nucleic Acids Research. 2016; gkw377.

- Xie Z, Bailey A, Kuleshov MV, Clarke DJB., Evangelista JE, Jenkins SL, Lachmann A, Wojciechowicz ML, Kropiwnicki E, Jagodnik KM, Jeon M, & Ma'ayan A. Gene set knowledge discovery with Enrichr. Current Protocols, 1, e90. 2021. doi: 10.1002/cpz1.90

- [Enrichr](https://maayanlab.cloud/Enrichr/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
