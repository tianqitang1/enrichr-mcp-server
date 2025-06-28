/**
 * This file contains descriptions for various Enrichr libraries.
 * The descriptions are used to dynamically populate the tool's help text,
 * giving the language model better context for choosing the right library.
 * 
 * Source: https://maayanlab.cloud/Enrichr/#libraries
 */
export const libraryDescriptions: { [key: string]: string } = {
  // Transcription
  "ChEA_2022": "ChIP-seq experiments from GEO, ENCODE, and publications, identifying transcription factor-gene interactions.",
  "ENCODE_TF_ChIP-seq_2015": "Transcription factor targets from ENCODE ChIP-seq data.",
  
  // Pathways
  "KEGG_2021_Human": "Metabolic and signaling pathways from the KEGG database for human.",
  "Reactome_2022": "Curated pathways from the Reactome database, covering signaling, metabolism, and other biological processes.",
  "WikiPathways_2023_Human": "Community-curated biological pathways from WikiPathways for human.",
  "MSigDB_Hallmark_2020": "Coherently expressed gene sets representing well-defined biological states or processes.",

  // Ontologies
  "GO_Biological_Process_2025": "Gene Ontology terms describing biological processes.",
  "GO_Molecular_Function_2025": "Gene Ontology terms describing molecular functions.",
  "GO_Cellular_Component_2025": "Gene Ontology terms describing cellular components.",
  "Human_Phenotype_Ontology": "Gene-disease associations based on human phenotypes.",

  // Diseases/Drugs
  "GWAS_Catalog_2023": "Gene-trait associations from the NHGRI-EBI GWAS Catalog.",
  "ClinVar_2019": "Genes associated with human genetic variants from the ClinVar database.",
  "DrugBank_2018": "Genes targeted by approved drugs and experimental small molecules.",

  // Tissues
  "GTEx_Tissue_Sample_Gene_Expression_Profiles_up": "Genes with elevated expression in specific tissues from the GTEx project.",
  "GTEx_Tissue_Sample_Gene_Expression_Profiles_down": "Genes with decreased expression in specific tissues from the GTEx project.",

  // MicroRNAs
  "TargetScan_microRNA_2017": "Predicted microRNA targets from TargetScan.",
}; 