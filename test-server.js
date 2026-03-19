#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Simple test script to communicate with the Enrichr MCP server
 */

const testGenes = ["TP53", "BRCA1", "BRCA2", "MYC", "EGFR", "AKT1", "PIK3CA", "KRAS", "RB1", "ATM"];
const libraries = ["GO_Biological_Process_2025", "KEGG_2021_Human", "MSigDB_Hallmark_2020", "Human_Phenotype_Ontology", "GWAS_Catalog_2023"];

async function testEnrichrServer() {
  console.log('🧪 Testing Enrichr MCP Server...');
  console.log(`📋 Testing genes: ${testGenes.join(', ')}`);
  console.log(`📚 Using libraries: ${libraries.join(', ')}\n`);

  // Start the server process
  const serverProcess = spawn('npx', [
    'enrichr-mcp-server', 
    '--libraries', 
    libraries.join(',')
  ], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let responseData = '';
  
  // Collect response data
  serverProcess.stdout.on('data', (data) => {
    responseData += data.toString();
  });

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };

  console.log('📤 Sending initialize request...');
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 500));

  // Send list tools request
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };

  console.log('📤 Sending list tools request...');
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  // Wait for tools list
  await new Promise(resolve => setTimeout(resolve, 500));

  // Send enrichment analysis request with new parameters
  const enrichmentRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "enrichr_analysis",
      arguments: {
        genes: testGenes,
        description: "Cancer-related genes test",
        maxTerms: 20,  // Show 20 terms instead of 10
        compact: true  // Use compact format
      }
    }
  };

  console.log('📤 Sending enrichment analysis request...');
  console.log('🔬 Analyzing genes with 20 terms per library in compact format...\n');
  
  serverProcess.stdin.write(JSON.stringify(enrichmentRequest) + '\n');

  // Wait for analysis to complete
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Close the server
  serverProcess.stdin.end();
  serverProcess.kill();

  // Parse and display results
  console.log('📥 Raw Response Data:');
  console.log('=' * 50);
  console.log(responseData);
  
  // Try to extract JSON responses
  const lines = responseData.split('\n').filter(line => line.trim());
  console.log('\n📊 Parsed Responses:');
  console.log('=' * 50);
  
  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line);
      console.log(`\n--- Response ${index + 1} ---`);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(`Line ${index + 1}: ${line}`);
    }
  });
}

// Run the test
testEnrichrServer().catch(console.error); 