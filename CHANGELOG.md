## Changelog

### v0.3.0 (2026-01-17)

#### Breaking Changes

- **MCP SDK Update:** Updated `@modelcontextprotocol/sdk` from v1.0.4 to v1.25.2. This is a major update spanning over 20 minor versions.
- **New Dependency:** Added `zod` (^3.25.0) as a required peer dependency for the updated MCP SDK.

#### Features

- **MCP Specification Compliance:** Now compliant with [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25).
- **Improved Response Format:** Tool responses now include serialized JSON in text content for backwards compatibility, per MCP spec recommendation.

#### Improvements

- **Broader Client Support:** Compatible with all major MCP clients including Claude Desktop, ChatGPT, Cursor, Gemini, Microsoft Copilot, and VS Code.
- **Security Fixes:** Inherits security fixes from SDK updates including RegEx DoS prevention and header validation improvements.

#### Migration Guide

1. Run `npm install` to fetch updated dependencies
2. Run `npm run build` to rebuild the project
3. Restart Claude Desktop (or your MCP client) to reconnect

**Note:** Your existing schemas and memory data are fully compatible with this update.

---

### v0.2.8 (2024-12-24)

#### Features

- **Edge Weights:**
    - Introduced an optional `weight` property to the `Edge` interface to represent relationship strength in the range of 0-1.
    - Edge weights now default to 1 if not specified.

- **Enhanced Search:**
  - Modified `SearchManager` to include immediate neighbor nodes in `searchNodes` and `openNodes` results.

**Impact:**

- **Edge Weights:**
  - Enables a more nuanced representation of relationships in the knowledge graph, allowing for the expression of varying degrees of connection strength or confidence.
  - No changes in schemas.
  - 
- **Enhanced Search:**
  - Provides a more comprehensive view of the relevant portion of the knowledge graph returning more contextually relevant information to the AI.
