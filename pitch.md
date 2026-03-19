<!--
 * @Author: tianqitang1 Tianqi.Tang@ucsf.edu
 * @Date: 2025-06-27 16:57:30
 * @LastEditors: tianqitang1 Tianqi.Tang@ucsf.edu
 * @LastEditTime: 2025-06-29 07:00:07
 * @FilePath: /enrichr-mcp-server/pitch.md
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
As a bioinformatician with computer science background, I find it sometimes difficult to interpret the results of bioinformatics tools. Currently, I use a lot of Enrichr, an amazing tool for gene set enrichment analysis from Maayan lab. I always copy paste or download the results and ask LLMs to interpret them. This is a tedious process. Thanks to Maayan lab generously hosting public API for Enrichr, I vibe-coded a simple MCP server making use of their API, so you can check the function, pathway, and more of your gene sets without ever leaving your LLM! You can configure the server for any LLM tool supporting MCP, such as Claude Desktop, Cursor, Cherry Studio, etc.

The repo is at https://github.com/tianqitang1/enrichr-mcp-server. Please try it out! Any issue or pull request is welcome.


The library_descriptions.ts file now contains over 300 library descriptions covering:

  - Transcription: ChIP-seq experiments, TF binding sites, histone modifications
  - Pathways: KEGG, Reactome, WikiPathways, BioCarta, MSigDB Hallmark
  - Ontologies: GO (Biological Process, Molecular Function, Cellular Component), Human Phenotype
  - Diseases/Drugs: GWAS, ClinVar, DrugBank, disease signatures, COVID-19 gene sets
  - Cell Types: GTEx tissues, Allen Brain Atlas, single-cell atlases (Tabula Muris/Sapiens)
  - MicroRNAs: TargetScan, miRTarBase predictions
  - Kinases: KEA, kinase perturbations, PhosphoSitePlus
  - Cancer: COSMIC, TCGA, DepMap, OncoKB
  - Single Cell: Various scRNA-seq derived markers
  - Protein Interactions: STRING, BioGRID, IntAct
  - And many more specialized categories


An MCP server for gene set enrichment analysis. Allows the model to analyze the function, reactome, pathway etc.. with grounding from Enrichr,  simplifying functional analysis for researchers and developers.