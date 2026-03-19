import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  formatMultiLibraryResults,
  saveResultsToTSV,
  queryEnrichrLibraries,
  type LibraryResults,
} from "../index.js";
import { libraryDescriptions } from "../library_descriptions.js";

/**
 * MCP protocol-level tests using in-memory transport.
 * Tests that the server correctly lists tools and handles requests.
 */

function createTestServer() {
  const server = new McpServer({
    name: "enrichr-server-test",
    version: "0.0.0-test",
  });

  const allAvailableLibraries = Object.keys(libraryDescriptions)
    .map((lib) => `'${lib}'`)
    .join(", ");

  server.registerTool(
    "enrichr_analysis",
    {
      title: "Enrichr Enrichment Analysis",
      description: "Test tool for enrichment analysis.",
      inputSchema: z.object({
        genes: z.array(z.string()).min(2).describe("Gene symbols"),
        libraries: z.array(z.string()).optional(),
        description: z.string().optional(),
        maxTerms: z.number().int().min(1).max(100).optional(),
        format: z.enum(["detailed", "compact", "minimal"]).optional(),
        outputFile: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ genes, libraries, description, maxTerms, format }) => {
      const libs = libraries ?? ["GO_Biological_Process_2025"];
      const desc = description ?? "test";
      const max = maxTerms ?? 50;
      const fmt = format ?? "detailed";

      const resultsData = await queryEnrichrLibraries(genes, libs, desc);
      const text = formatMultiLibraryResults(resultsData, max, fmt);

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  return server;
}

describe("MCP protocol", () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    server = createTestServer();
    client = new Client({ name: "test-client", version: "1.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("lists the enrichr_analysis tool", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("enrichr_analysis");
    expect(tools[0].description).toContain("enrichment analysis");
  });

  it("tool has correct input schema properties", async () => {
    const { tools } = await client.listTools();
    const schema = tools[0].inputSchema as any;
    expect(schema.properties).toHaveProperty("genes");
    expect(schema.properties).toHaveProperty("libraries");
    expect(schema.properties).toHaveProperty("format");
    expect(schema.properties).toHaveProperty("maxTerms");
  });

  it("tool has annotations", async () => {
    const { tools } = await client.listTools();
    const tool = tools[0] as any;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });

  it.skipIf(!!process.env.CI)(
    "calls enrichr_analysis with real API",
    async () => {
      const result = await client.callTool({
        name: "enrichr_analysis",
        arguments: {
          genes: ["TP53", "BRCA1", "BRCA2"],
          libraries: ["GO_Biological_Process_2025"],
          maxTerms: 5,
          format: "compact",
        },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      const textContent = (result.content as any[])[0];
      expect(textContent.type).toBe("text");
      expect(textContent.text).toContain("GO_Biological_Process_2025");
    }
  );
});
