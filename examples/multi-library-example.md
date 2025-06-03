# Multi-Library Enrichment Analysis Examples

This document provides examples of how to use the new `enrichr_analysis` tool to perform enrichment analysis across multiple gene set libraries simultaneously.

## Basic Examples

### Example 1: Cancer Gene Analysis Across Multiple Categories

Analyze cancer-related genes across GO, pathways, and disease databases:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["TP53", "BRCA1", "BRCA2", "MYC", "EGFR", "AKT1", "PIK3CA", "KRAS", "RB1", "ATM"],
    "libraries": [
      "GO_Biological_Process_2025",
      "KEGG_2021_Human", 
      "MSigDB_Hallmark_2020",
      "Human_Phenotype_Ontology",
      "GWAS_Catalog_2023"
    ],
    "description": "Well-known cancer genes"
  }
}
```

### Example 2: Cell Cycle Genes - GO and Pathways Focus

Analyze cell cycle genes focusing on biological processes and pathway databases:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["CDK1", "CDK2", "CCNA2", "CCNB1", "CCND1", "RB1", "E2F1", "P53", "ATM", "CHEK1"],
    "libraries": [
      "GO_Biological_Process_2025",
      "GO_Molecular_Function_2025",
      "KEGG_2021_Human",
      "Reactome_2022",
      "WikiPathways_2023_Human"
    ],
    "description": "Cell cycle regulatory genes"
  }
}
```

### Example 3: Neurological Disease Genes

Analyze genes associated with neurological conditions:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["APOE", "APP", "PSEN1", "PSEN2", "SNCA", "LRRK2", "PINK1", "PARK7", "HTT", "SOD1"],
    "libraries": [
      "Human_Phenotype_Ontology",
      "OMIM_Disease",
      "ClinVar_2019",
      "GO_Biological_Process_2025",
      "GTEx_Tissue_Sample_Gene_Expression_Profiles_up"
    ],
    "description": "Neurodegenerative disease genes"
  }
}
```

## Advanced Examples

### Example 4: Comprehensive Analysis - All Major Categories

Perform a comprehensive analysis across all major gene set categories:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["TNF", "IL1B", "IL6", "NFKB1", "TLR4", "MYD88", "IRAK1", "TRAF6", "IRF3", "STAT1"],
    "libraries": [
      "GO_Biological_Process_2025",
      "KEGG_2021_Human",
      "MSigDB_Hallmark_2020",
      "Human_Phenotype_Ontology",
      "ChEA_2022",
      "ENCODE_TF_ChIP-seq_2015",
      "GTEx_Tissue_Sample_Gene_Expression_Profiles_up",
      "L1000_Kinase_and_GPCR_Perturbations_up"
    ],
    "description": "Inflammatory response genes"
  }
}
```

### Example 5: Drug Target Discovery

Analyze potential drug targets by examining genes across drug and pathway databases:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["EGFR", "HER2", "VEGFA", "PDGFRA", "KIT", "ABL1", "SRC", "JAK2", "PIK3CA", "MTOR"],
    "libraries": [
      "DrugMatrix",
      "L1000_Kinase_and_GPCR_Perturbations_up",
      "TG_GATEs_2019",
      "KEGG_2021_Human",
      "Reactome_2022",
      "Human_Phenotype_Ontology"
    ],
    "description": "Known kinase drug targets"
  }
}
```

### Example 6: Tissue-Specific Gene Expression

Analyze tissue-specific expression patterns:

```json
{
  "name": "enrichr_analysis",
  "arguments": {
    "genes": ["ALB", "CYP3A4", "HNF4A", "APOB", "TTR", "F2", "FGB", "SERPINA1", "CPS1", "G6PC"],
    "libraries": [
      "GTEx_Tissue_Sample_Gene_Expression_Profiles_up",
      "Human_Gene_Atlas",
      "ARCHS4_Tissues",
      "GO_Cellular_Component_2025",
      "GO_Biological_Process_2025"
    ],
    "description": "Liver-specific genes"
  }
}
```

## Library Categories and Use Cases

### Gene Ontology Libraries
- `GO_Biological_Process_2025` - Biological processes
- `GO_Molecular_Function_2025` - Molecular functions
- `GO_Cellular_Component_2025` - Cellular localization

### Pathway Libraries
- `KEGG_2021_Human` - KEGG pathways
- `Reactome_2022` - Reactome pathways
- `WikiPathways_2023_Human` - WikiPathways
- `MSigDB_Hallmark_2020` - MSigDB hallmark gene sets
- `BioCarta_2016` - BioCarta pathways

### Disease/Phenotype Libraries
- `Human_Phenotype_Ontology` - Human phenotypes
- `OMIM_Disease` - OMIM diseases
- `ClinVar_2019` - ClinVar variants
- `GWAS_Catalog_2023` - GWAS associations
- `DisGeNET` - Gene-disease associations

### Tissue/Cell Type Libraries
- `GTEx_Tissue_Sample_Gene_Expression_Profiles_up` - GTEx tissue expression
- `Human_Gene_Atlas` - Tissue expression atlas
- `ARCHS4_Tissues` - ARCHS4 tissue data
- `Human_Cell_Atlas_2020` - Single-cell expression

### Drug/Chemical Libraries
- `DrugMatrix` - Drug effects
- `L1000_Kinase_and_GPCR_Perturbations_up` - L1000 perturbations
- `TG_GATEs_2019` - TG-GATEs toxicogenomics
- `CTD_2018` - Comparative Toxicogenomics Database

### Transcription Factor Libraries
- `ChEA_2022` - ChIP-seq experiments
- `ENCODE_TF_ChIP-seq_2015` - ENCODE TF data
- `TRANSFAC_and_JASPAR_PWMs` - TF binding motifs

### MicroRNA Libraries
- `TargetScan_microRNA_2017` - TargetScan predictions
- `miRTarBase_2017` - Experimentally validated targets

## Tips for Multi-Library Analysis

1. **Start Focused**: Begin with 3-5 relevant libraries rather than querying everything
2. **Combine Complementary Sources**: Mix GO with pathways, or diseases with tissues
3. **Consider Your Research Question**: Choose libraries that align with your biological question
4. **Check Library Currency**: Use the most recent versions when available (e.g., 2022, 2023, 2025)
5. **Be Patient**: Multiple library queries may take a bit longer to complete

## Common Library Combinations

### For Cancer Research:
```json
["GO_Biological_Process_2025", "KEGG_2021_Human", "MSigDB_Hallmark_2020", "Human_Phenotype_Ontology", "L1000_Kinase_and_GPCR_Perturbations_up"]
```

### For Neuroscience:
```json
["GO_Biological_Process_2025", "Human_Phenotype_Ontology", "GTEx_Tissue_Sample_Gene_Expression_Profiles_up", "OMIM_Disease", "ChEA_2022"]
```

### For Drug Discovery:
```json
["DrugMatrix", "L1000_Kinase_and_GPCR_Perturbations_up", "KEGG_2021_Human", "Human_Phenotype_Ontology", "ChEA_2022"]
```

### For Development Biology:
```json
["GO_Biological_Process_2025", "MSigDB_Hallmark_2020", "ENCODE_TF_ChIP-seq_2015", "GTEx_Tissue_Sample_Gene_Expression_Profiles_up"]
``` 