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
  suggestLibraries,
  formatFullCatalog,
  formatCategoryCatalog,
  buildEnrichmentPrompt,
  type LibraryResults,
} from "../index.js";
import { libraryDescriptions, LIBRARY_CATEGORIES } from "../library_descriptions.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

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
      description: "Test tool for enrichment analysis. Use suggest_libraries to find relevant libraries.",
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

  // suggest_libraries tool
  const categoryNames = Object.keys(LIBRARY_CATEGORIES) as [string, ...string[]];

  server.registerTool(
    "suggest_libraries",
    {
      title: "Suggest Enrichr Libraries",
      description: "Suggest relevant Enrichr libraries for a research question.",
      inputSchema: z.object({
        query: z.string().describe("Research context"),
        category: z.enum(categoryNames).optional(),
        maxResults: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        suggestions: z.array(z.object({
          library: z.string(),
          category: z.string(),
          description: z.string(),
          relevanceScore: z.number(),
        })),
        totalAvailable: z.number(),
        query: z.string(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, category, maxResults }) => {
      const max = maxResults ?? 10;
      const suggestions = suggestLibraries(query, category, max);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(suggestions) }],
        structuredContent: {
          suggestions,
          totalAvailable: Object.keys(libraryDescriptions).length,
          query,
        },
      };
    }
  );

  // Library catalog resources
  server.registerResource(
    "library_catalog",
    "enrichr://libraries",
    {
      title: "Enrichr Library Catalog",
      description: "All available Enrichr libraries organized by category",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: formatFullCatalog() }],
    })
  );

  server.registerResource(
    "library_catalog_by_category",
    new ResourceTemplate("enrichr://libraries/{category}", {
      list: async () => ({
        resources: Object.keys(LIBRARY_CATEGORIES).map((cat) => ({
          uri: `enrichr://libraries/${cat}`,
          name: `${cat} libraries`,
        })),
      }),
    }),
    {
      title: "Enrichr Libraries by Category",
      description: "Libraries for a specific category",
      mimeType: "text/plain",
    },
    async (uri, variables) => ({
      contents: [{ uri: uri.href, text: formatCategoryCatalog(variables.category as string) }],
    })
  );

  // enrichment_analysis prompt
  server.registerPrompt(
    "enrichment_analysis",
    {
      title: "Enrichment Analysis Workflow",
      description: "Guided workflow for gene set enrichment analysis",
      argsSchema: {
        genes: z.string().describe("Gene symbols"),
        context: z.string().optional().describe("Research context"),
      },
    },
    async ({ genes, context }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildEnrichmentPrompt(genes, context),
          },
        },
      ],
    })
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

  it("lists both tools", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["enrichr_analysis", "suggest_libraries"]);
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

  it("suggest_libraries has correct annotations", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "suggest_libraries") as any;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });

  it("calls suggest_libraries with query (no network)", async () => {
    const result = await client.callTool({
      name: "suggest_libraries",
      arguments: { query: "cancer" },
    });

    expect(result.content).toBeDefined();
    const structured = (result as any).structuredContent;
    expect(structured.suggestions.length).toBeGreaterThan(0);
    expect(structured.query).toBe("cancer");
    expect(structured.totalAvailable).toBeGreaterThan(0);
  });

  it("listResources returns the static catalog resource", async () => {
    const { resources } = await client.listResources();
    const catalog = resources.find((r) => r.uri === "enrichr://libraries");
    expect(catalog).toBeDefined();
    expect(catalog!.name).toBe("library_catalog");
  });

  it("readResource enrichr://libraries returns text with category headers", async () => {
    const result = await client.readResource({ uri: "enrichr://libraries" });
    const text = (result.contents[0] as any).text;
    expect(text).toContain("## pathways");
    expect(text).toContain("## cancer");
    expect(text).toContain("KEGG_2021_Human");
  });

  it("listPrompts returns enrichment_analysis", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    const prompt = prompts.find((p) => p.name === "enrichment_analysis");
    expect(prompt).toBeDefined();
  });

  it("getPrompt enrichment_analysis returns valid prompt result", async () => {
    const result = await client.getPrompt({
      name: "enrichment_analysis",
      arguments: { genes: "TP53,BRCA1" },
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    const text = (result.messages[0].content as any).text;
    expect(text).toContain("TP53,BRCA1");
    expect(text).toContain("enrichr_analysis");
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
