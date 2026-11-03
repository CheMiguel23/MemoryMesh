# MemoryMesh
[![Release](https://img.shields.io/badge/Release-v0.4.0-blue.svg)](./CHANGELOG.md)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC.svg?logo=typescript&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![GitHub Stars](https://img.shields.io/github/stars/CheMiguel23/MemoryMesh.svg?style=social)

MemoryMesh is an MCP server that gives AI models a structured, long-term memory in the form of a knowledge graph. You describe the kinds of things you want to remember in small **schema files** (people, projects, characters, locations, books...), and MemoryMesh turns each one into tools the AI uses to add, update and delete that information, linking related items as it goes.

It works for anything you can describe as things and the connections between them: a text-based RPG world, the people and teams at your company, a personal CRM, or your reading notes.

*Based on the [Knowledge Graph Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) from the MCP servers repository.*

<a href="https://glama.ai/mcp/servers/kf6n6221pd"><img width="380" height="200" src="https://glama.ai/mcp/servers/kf6n6221pd/badge" alt="MemoryMesh MCP server" /></a>

[![MseeP.ai Security Assessment](https://mseep.net/pr/chemiguel23-memorymesh-badge.png)](https://mseep.ai/app/chemiguel23-memorymesh)

## How it works

The memory is a graph of **nodes** and **edges**:

- A **node** is a thing: `{"name": "Mara", "nodeType": "npc", "metadata": ["role: Blacksmith", "status: injured"]}`
- An **edge** is a connection between two nodes: `{"from": "Mara", "to": "Riverton", "edgeType": "located_in"}`. Edges can have an optional `weight` from 0 to 1 (strength or confidence; treated as 1 when not set).

A **schema** describes one type of node. For a schema named `add_npc`, MemoryMesh creates three tools:

- `add_npc` creates an NPC. Fields marked as relationships also create edges to the nodes they name.
- `update_npc` changes the fields you pass and keeps everything else. Passing `metadata` replaces the whole list.
- `delete_npc` removes the NPC and its edges.

Every call is all-or-nothing: if anything is wrong (a missing required field, a link to a node that doesn't exist), nothing is saved, and the AI gets a clear error it can act on.

### Schema format

Each schema is a JSON file ending in `.schema.json`. This is the `npc` example that ships with MemoryMesh:

```json
{
  "name": "add_npc",
  "description": "Add a new character (NPC) to the knowledge graph",
  "properties": {
    "name": { "type": "string", "description": "The character's unique name", "required": true },
    "description": { "type": "string", "description": "Who the character is", "required": true },
    "status": { "type": "string", "description": "Current condition", "enum": ["alive", "injured", "dead", "missing"] },
    "traits": { "type": "array", "description": "Personality traits" },
    "currentLocation": {
      "type": "string",
      "description": "Where the character is now",
      "relationship": { "edgeType": "located_in", "description": "Where the character is now (must already exist)" }
    }
  },
  "additionalProperties": true
}
```

| Key | Meaning |
|---|---|
| `name` | Must start with `add_`. The rest becomes the node type and tool suffix (`npc` → `add_npc`, `update_npc`, `delete_npc`). |
| `description` | Description of the `add_` tool, shown to the AI. |
| `properties` | The fields. Each has a `type` (`string` or `array`) and a `description`, plus optionally: |
| ↳ `required` | `true` if the AI must provide this field. Keep this to a minimum, or the AI will invent values it doesn't know. |
| ↳ `enum` | A list of allowed values. |
| ↳ `relationship` | Creates an edge (`edgeType`) to each node named in this field. Those nodes must already exist. |
| `additionalProperties` | `true` (default) saves fields not listed above as extra metadata; `false` rejects them. |

If a schema file is invalid, MemoryMesh skips it, logs the reason, and starts with the others.

The [SchemaManager](https://github.com/CheMiguel23/MemoryMesh/blob/main/SchemaManager.html) lets you create and edit schemas visually ([guide](https://github.com/CheMiguel23/MemoryMesh/discussions/3)).

<img width="370" alt="SchemaManager" src="https://github.com/user-attachments/assets/e8f0c808-2ff6-48da-ac7c-cf51aebde7b8">

### Example schema sets

MemoryMesh ships with two small examples, `npc` and `location`. Ready-made sets for different uses are shared in [Discussions](https://github.com/CheMiguel23/MemoryMesh/discussions):

- **[People & organization](https://github.com/CheMiguel23/MemoryMesh/discussions/67)**: people, teams, projects, places and events (who reports to whom, who's responsible for what, who went where, birthdays)
- **[Personal CRM](https://github.com/CheMiguel23/MemoryMesh/discussions/68)**: contacts, companies, interactions and follow-ups
- **[Research & reading notes](https://github.com/CheMiguel23/MemoryMesh/discussions/69)**: sources, authors, concepts and notes
- **[RPG & storytelling](https://github.com/CheMiguel23/MemoryMesh/discussions/70)**: the full set of 11 schemas for text-based games

Feel free to share your own.

### Built-in tools

These are always available, whatever schemas you use:

| Tool | Purpose |
|---|---|
| `read_graph` | Return the whole graph |
| `search_nodes` | Find nodes by name, type or metadata, with their direct neighbours |
| `open_nodes` | Return specific nodes by name, with their direct neighbours |
| `add_nodes`, `update_nodes`, `delete_nodes` | Work with nodes of any type |
| `add_edges`, `update_edges`, `delete_edges` | Work with edges |
| `add_metadata`, `delete_metadata` | Add or remove individual metadata entries |

## Installation

You need [Node.js](https://nodejs.org/) 18 or newer and an MCP client such as [Claude Desktop](https://claude.ai/download).

1. Download and build MemoryMesh:

   ```bash
   git clone https://github.com/CheMiguel23/MemoryMesh.git
   ```

   ```bash
   cd MemoryMesh
   ```

   ```bash
   npm install
   ```

   `npm install` also builds the project into `dist/`.

2. Add MemoryMesh to Claude Desktop. Open **Settings → Developer → Edit Config** and add:

   ```json
   {
     "mcpServers": {
       "memorymesh": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/MemoryMesh/dist/index.js"]
       }
     }
   }
   ```

   On Windows, double every backslash: `"C:\\Projects\\MemoryMesh\\dist\\index.js"`.

3. Fully quit and restart Claude Desktop. MemoryMesh and its tools (`add_npc`, `read_graph`, ...) appear in the tools menu of the chat box.

### Updating

```bash
git pull
```

```bash
npm install
```

Then restart your MCP client. Updating keeps your memory file and any schemas you edited.

## Configuration

| Environment variable | What it sets | Default |
|---|---|---|
| `MEMORYMESH_MEMORY_FILE` | Path of the memory file | `dist/data/memory.json` |
| `MEMORYMESH_SCHEMAS_DIR` | Folder containing `.schema.json` files | `dist/data/schemas` |

Set them in your Claude Desktop config:

```json
"memorymesh": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/MemoryMesh/dist/index.js"],
  "env": {
    "MEMORYMESH_MEMORY_FILE": "/ABSOLUTE/PATH/TO/my-project/memory.json",
    "MEMORYMESH_SCHEMAS_DIR": "/ABSOLUTE/PATH/TO/my-project/schemas"
  }
}
```

Keeping your schemas and memory in a folder of your own keeps them separate from the MemoryMesh code. You can also run several MemoryMesh entries with different folders, for example one per campaign or project.

**Docker:** `docker build -t memorymesh .` then `docker run -i --rm -v memorymesh-data:/data memorymesh`. The memory file is `/data/memory.json` inside the container.

## Viewing your memory

The memory file stores one JSON object per line. The [MemoryViewer](https://github.com/CheMiguel23/MemoryMesh/blob/main/MemoryViewer.html) displays it as a searchable table with stats ([guide](https://github.com/CheMiguel23/MemoryMesh/discussions/15)): open it in Chrome or Edge, click **Select Memory File**, and pick your `memory.json`.

## Tips

- Tell the AI what the memory is for, for example in a Claude Project's instructions: *"Use the memorymesh tools to record every person, team and project I mention, and check the graph before answering questions about them."*
- The AI can be hesitant to delete things. Ask explicitly when you want something removed.
- When information conflicts, the latest update wins. To keep both versions, record the source or date in metadata (`"source: tavern gossip"`, `"as of: chapter 3"`), or store competing claims as separate nodes.

## Troubleshooting

- **MemoryMesh doesn't appear in Claude Desktop:** check that the path in the config is absolute and points to `dist/index.js` (with doubled backslashes on Windows), and that `npm install` finished without errors.
- **Tools are missing:** check that your schema files end in `.schema.json` and that their `name` starts with `add_`.
- **Check the log**, where MemoryMesh reports which schemas it loaded and why any were skipped:
  - macOS: `~/Library/Logs/Claude/mcp-server-memorymesh.log`
  - Windows: the `logs` folder inside `%APPDATA%\Claude`

## Development

```bash
npm install     # also builds
npm test        # runs the test suite
npm run watch   # recompiles on change
```

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point: loads schemas and starts the server on stdio |
| `src/server.ts` | Lists tools and routes each tool call to its handler |
| `src/tools.ts` | Definitions of the built-in tools |
| `src/schemas.ts` | Loads schema files and implements the generated `add_`/`update_`/`delete_` tools |
| `src/graph.ts` | The graph operations themselves, with input validation |
| `src/store.ts` | Reads and writes the memory file, one change at a time |
| `src/config.ts` | Paths and version |
| `src/types.ts` | Shared types |

## Contributing

Contributions, feedback, ideas and schema sets are welcome. Open an issue, start a discussion, or send a pull request.
