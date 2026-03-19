# Configuration Examples

This document provides practical examples of configuring the Enrichr MCP Server for different research scenarios and use cases.

## Quick Start Configurations

### 1. GO Biological Process Only (Your Current Need)

Perfect for users who only want GO Biological Process enrichment:

```json
{
  "mcpServers": {
    "enrichr-go-bp": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "--libraries", "GO_Biological_Process_2025"]
    }
  }
}
```

**Benefits:**
- Simple, focused analysis
- Faster queries (single library)
- Clean, targeted results

**Usage:** After this configuration, all your `enrichr_analysis` tool calls will default to GO Biological Process 2025 unless you specify otherwise.

### 2. GO Trinity (All GO Categories)

For comprehensive Gene Ontology analysis:

```json
{
  "mcpServers": {
    "enrichr-go-full": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,GO_Molecular_Function_2025,GO_Cellular_Component_2025"]
    }
  }
}
```

### 3. Pathways Focus

For pathway-centric research:

```json
{
  "mcpServers": {
    "enrichr-pathways": {
      "command": "npx", 
      "args": ["-y", "enrichr-mcp-server", "--libraries", "KEGG_2021_Human,Reactome_2022,WikiPathways_2023_Human,MSigDB_Hallmark_2020"]
    }
  }
}
```

## Research-Specific Configurations

### Cancer Research Setup

```json
{
  "mcpServers": {
    "enrichr-cancer": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,MSigDB_Hallmark_2020,KEGG_2021_Human,Human_Phenotype_Ontology,L1000_Kinase_and_GPCR_Perturbations_up"],
      "env": {
        "ENRICHR_SERVER_NAME": "cancer-enrichr"
      }
    }
  }
}
```

### Neuroscience Research Setup

```json
{
  "mcpServers": {
    "enrichr-neuro": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server"],
      "env": {
        "ENRICHR_DEFAULT_LIBRARIES": "GO_Biological_Process_2025,Human_Phenotype_Ontology,GTEx_Tissue_Sample_Gene_Expression_Profiles_up,OMIM_Disease,ChEA_2022",
        "ENRICHR_SERVER_NAME": "neuro-enrichr"
      }
    }
  }
}
```

### Drug Discovery Setup  

```json
{
  "mcpServers": {
    "enrichr-drug": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "--libraries", "DrugMatrix,L1000_Kinase_and_GPCR_Perturbations_up,KEGG_2021_Human,Human_Phenotype_Ontology,ChEA_2022"]
    }
  }
}
```

## Multi-Instance Configurations

You can run multiple instances with different default libraries:

```json
{
  "mcpServers": {
    "enrichr-go": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025", "-n", "go-enrichr"]
    },
    "enrichr-pathways": {
      "command": "npx", 
      "args": ["-y", "enrichr-mcp-server", "-l", "KEGG_2021_Human,Reactome_2022", "-n", "pathway-enrichr"]
    },
    "enrichr-disease": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "Human_Phenotype_Ontology,OMIM_Disease", "-n", "disease-enrichr"]
    }
  }
}
```

## Environment Variable Configurations

### Using .env File

Create a `.env` file in your project:

```bash
ENRICHR_DEFAULT_LIBRARIES=GO_Biological_Process_2025,KEGG_2021_Human
ENRICHR_SERVER_NAME=my-enrichr-server
```

Then in your MCP configuration:

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

### System Environment Variables

```bash
# Set system-wide defaults
export ENRICHR_DEFAULT_LIBRARIES="GO_Biological_Process_2025"
export ENRICHR_SERVER_NAME="system-enrichr"

# Then use simple configuration
```

## Advanced Configurations

### Development vs Production

#### Development (comprehensive analysis)
```json
{
  "mcpServers": {
    "enrichr-dev": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,KEGG_2021_Human,MSigDB_Hallmark_2020,Human_Phenotype_Ontology"]
    }
  }
}
```

#### Production (focused, fast)
```json
{
  "mcpServers": {
    "enrichr-prod": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025"]
    }
  }
}
```

### Lab-Specific Configurations

#### Immunology Lab
```json
{
  "mcpServers": {
    "enrichr-immuno": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "--libraries", "GO_Biological_Process_2025,KEGG_2021_Human,Reactome_2022,MSigDB_Hallmark_2020,GTEx_Tissue_Sample_Gene_Expression_Profiles_up"]
    }
  }
}
```

#### Metabolomics Lab
```json
{
  "mcpServers": {
    "enrichr-metab": {
      "command": "npx",
      "args": ["-y", "enrichr-mcp-server", "-l", "GO_Biological_Process_2025,GO_Molecular_Function_2025,KEGG_2021_Human,Reactome_2022,HumanCyc_2016"]
    }
  }
}
```

## Testing Your Configuration

After setting up your configuration, test it:

1. **Restart your MCP client** (e.g., restart Cursor)
2. **Check server startup**: Look for startup messages showing your default libraries
3. **Test with simple gene list**:

```json
{
  "name": "enrichr_analysis", 
  "arguments": {
    "genes": ["TP53", "MYC", "EGFR"]
  }
}
```

The tool should use your configured default libraries without needing to specify them.

## Troubleshooting Configuration

### Common Issues

1. **Libraries not recognized**: Check spelling and case sensitivity
2. **Comma separation**: Ensure no spaces after commas in CLI arguments 
3. **JSON syntax**: Validate your JSON configuration
4. **Server not starting**: Check the server logs for error messages

### Validation

```bash
# Test your configuration locally
npx enrichr-mcp-server --libraries "GO_Biological_Process_2025" --help
```

### Getting Available Libraries

You can check available libraries at: https://maayanlab.cloud/Enrichr/#libraries

## Best Practices

1. **Start Simple**: Begin with 1-2 libraries, add more as needed
2. **Use Descriptive Names**: Name your servers based on their purpose
3. **Document Your Setup**: Keep notes on why you chose specific libraries
4. **Test Changes**: Always test configuration changes with known gene lists
5. **Version Control**: Keep your MCP configuration in version control 