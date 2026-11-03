## Changelog

### Unreleased

- **Bundled examples reduced to two small schemas** (`npc` and `location`), rewritten to be self-contained and to require only the fields that matter. The full [RPG set](https://github.com/CheMiguel23/MemoryMesh/discussions/70) and new sets ([People & organization](https://github.com/CheMiguel23/MemoryMesh/discussions/67), [Personal CRM](https://github.com/CheMiguel23/MemoryMesh/discussions/68), [Research & reading notes](https://github.com/CheMiguel23/MemoryMesh/discussions/69)) are shared in Discussions. Existing installs keep any schemas already in `dist/data/schemas`.
- **README rewritten** to be shorter and up to date.

---

### v0.4.0 (2026-11-03)

A cleanup release. The internals were rewritten from ~4,700 lines across 68 files into ~1,200 lines in 8 files. Tool names, tool arguments, schema files and the memory file format are unchanged, so existing setups and data keep working.

#### Fixes

- **Rebuilding no longer erases your memory.** `npm run build` (which also runs on every `npm install`) used to copy an empty `memory.json` over `dist/data/memory.json`. It now never touches the memory file, and does not overwrite schemas you edited in `dist/data/schemas`.
- **Failed calls no longer save partial data.** For example, `add_npc` with a `currentLocation` that didn't exist used to report an error but still save the NPC (#35). Every tool call is now all-or-nothing.
- **`update_<entity>` no longer damages metadata.** It used to delete entries without a `key: value` colon, rename keys (`currentLocation` → `Currentlocation`), and silently ignore its `metadata` argument. Now it updates only the fields you pass, keeps everything else, and `metadata` replaces the list as documented.
- **`read_graph` works when the client sends no arguments.**
- **Delete tools return a readable result** instead of an empty one, so the AI can see what happened.
- **`add_temporal` (and any schema without a `name` property) now works.** The tool required `name` but didn't advertise it.
- **Safer writes.** The memory file is written to a temporary file and then renamed, so a crash can't leave it half-written. Simultaneous tool calls are processed one at a time, so none of them is lost.
- **A corrupt line in the memory file is reported** (with its line number) instead of being silently dropped on the next save.
- **MemoryViewer: stored values are displayed as text**, so markup in node metadata or edge names can no longer run as script in the viewer (#64).

#### Changes

- **Configurable paths:** `MEMORYMESH_MEMORY_FILE` and `MEMORYMESH_SCHEMAS_DIR` environment variables.
- **Clearer error messages** for the AI, e.g. listing every missing required field at once, or explaining which relationship target doesn't exist.
- `update_<entity>` now marks `name` as required, and `additionalProperties: false` in a schema is enforced.
- An invalid schema file is skipped (with the reason in the log) instead of preventing the server from starting.
- Unknown tool names return a protocol error, as the MCP spec requires.
- Tool results are a single text block (summary followed by JSON data). The unused `structuredContent` field was removed.
- Updated `@modelcontextprotocol/sdk` to 1.32.2 and `zod` to 4; `npm audit` reports no vulnerabilities. Removed unused build dependencies (`ts-node`, `tsc-alias`, `copyfiles`, `shx`).
- Docker image uses Node 22 and stores memory in a `/data` volume.

---

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
