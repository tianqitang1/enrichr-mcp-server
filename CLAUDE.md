# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an MCP (Model Context Protocol) server that provides gene set enrichment analysis using the Enrichr API. It allows querying multiple gene set libraries simultaneously and returns statistically significant results. Built on MCP SDK v1.x with the high-level `McpServer` API.

## Essential Commands

```bash
# Build the TypeScript code
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Development mode with auto-rebuild
npm run watch

# Debug with MCP inspector
npm run inspector
```

## Architecture

The server uses `McpServer` from `@modelcontextprotocol/sdk` with `StdioServerTransport` for stdio communication. Single file server design:

- **src/index.ts**: Main server — configuration, Enrichr API, formatting, tool registration
- **src/library_descriptions.ts**: Metadata descriptions for all Enrichr libraries
- **src/__tests__/**: Test suite (unit, integration, MCP protocol tests)

### MCP Primitives:
- **Tools**: `enrichr_analysis` (run enrichment), `suggest_libraries` (discover relevant libraries by keyword)
- **Resources**: `enrichr://libraries` (full catalog), `enrichr://libraries/{category}` (by-category template)
- **Prompts**: `enrichment_analysis` (guided workflow with library selection and interpretation)

### Key design decisions:
- **Two tools** — `enrichr_analysis` for execution, `suggest_libraries` for discovery (no network needed)
- **Category system** — `LIBRARY_CATEGORIES` in `library_descriptions.ts` maps each library to one of 22 categories
- **Parallel library queries** via `Promise.all` for fast multi-library analysis
- **Structured output** — tools return both text content and typed JSON (`structuredContent`)
- **Zod schemas** for input validation and output typing
- **Native fetch** — no `node-fetch` dependency (Node 18+ required)
- **Tool annotations** — `enrichr_analysis`: `openWorldHint: true`, `suggest_libraries`: `openWorldHint: false`

## Key Development Patterns

1. **Adding New Libraries**: Add entries to `libraryDescriptions` and the appropriate `LIBRARY_CATEGORIES` array in `src/library_descriptions.ts`
2. **Tool Implementation**: Uses `server.registerTool()` with Zod input/output schemas
3. **Error Handling**: API calls use `AbortSignal.timeout(30_000)` and try-catch
4. **Output Formatting**: Three formats (detailed/compact/minimal) to manage token usage
5. **Enrichr types**: Raw API tuples are mapped to typed `EnrichrTerm` objects at the boundary

## Configuration System

CLI arguments take precedence over environment variables. Configuration is parsed in `parseConfig()` which is exported for testing. All config options have both short and long forms.

## Testing

Tests use vitest. Three test files:
- `unit.test.ts` — config parsing, formatting, TSV export, category integrity, suggest_libraries, catalog formatting, prompt building (no network)
- `integration.test.ts` — real Enrichr API calls (skipped in CI via `process.env.CI`)
- `mcp-protocol.test.ts` — MCP protocol tests for tools, resources, and prompts via `InMemoryTransport` (real API call skipped in CI)

## Important Notes

- The main file must remain executable (build script sets permissions)
- All gene lists are submitted to Enrichr's public API
- Results are filtered for statistical significance (adjusted p < 0.05)
- The server can save complete results to TSV files via --output flag
- Version is read from package.json at runtime (not hardcoded)
