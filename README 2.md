# MemoryMesh
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/CheMiguel23/MemoryMesh)](https://archestra.ai/mcp-catalog/chemiguel23__memorymesh)
[![Release](https://img.shields.io/badge/Release-v0.2.8-blue.svg)](./CHANGELOG.md)
[![smithery badge](https://smithery.ai/badge/memorymesh)](https://smithery.ai/server/memorymesh)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC.svg?logo=typescript&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![GitHub Stars](https://img.shields.io/github/stars/CheMiguel23/MemoryMesh.svg?style=social)

MemoryMesh is a knowledge graph server designed for AI models, with a focus on text-based RPGs and interactive storytelling. It helps AI maintain consistent, structured memory across conversations, enabling richer and more dynamic interactions.

*The project is based on the [Knowledge Graph Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) from the MCP servers repository and retains its core functionality.*

<a href="https://glama.ai/mcp/servers/kf6n6221pd"><img width="380" height="200" src="https://glama.ai/mcp/servers/kf6n6221pd/badge" alt="MemoryMesh MCP server" /></a>

## IMPORTANT
Since `v0.2.7` the default location of schemas was changed to `dist/data/schemas`.
This location is not expected to change in the future, but if you are updating from a previous version, make sure to move your schema files to the new location.

## Quick Links

*   [Installation](#installation)
*   [Example](#example)
*   [SchemaManager Guide Discussion](https://github.com/CheMiguel23/MemoryMesh/discussions/3)
*   [MemoryViewer Guide Discussion](https://github.com/CheMiguel23/MemoryMesh/discussions/15)

## Overview

MemoryMesh is a local knowledge graph server that empowers you to build and manage structured information for AI models. While particularly well-suited for text-based RPGs, its adaptable design makes it useful for various applications, including social network simulations, organizational planning, or any scenario involving structured data.

### Key Features

*   **Dynamic Schema-Based Tools:** Define your data structure with schemas, and MemoryMesh automatically generates tools for adding, updating, and deleting data.
*   **Intuitive Schema Design:** Create schemas that guide the AI in generating and connecting nodes, using required fields, enumerated types, and relationship definitions.
*   **Metadata for AI Guidance:**  Use metadata to provide context and structure, helping the AI understand the meaning and relationships within your data.
*   **Relationship Handling:** Define relationships within your schemas to encourage the AI to create connections (edges) between related data points (nodes).
*   **Informative Feedback:**  Provides error feedback to the AI, enabling it to learn from mistakes and improve its interactions with the knowledge graph.
*   **Event Support:** An event system tracks operations, providing insights into how the knowledge graph is being modified.

#### Nodes

Nodes represent entities or concepts within the knowledge graph. Each node has:

* `name`: A unique identifier.
* `nodeType`: The type of the node (e.g., `npc`, `artifact`, `location`), defined by your schemas.
* `metadata`: An array of strings providing descriptive details about the node.
* `weight`: (Optional) A numerical value between 0 and 1 representing the strength of the relationship, defaulting to 1.

**Example Node:**

```json
    {
      "name": "Aragorn",
      "nodeType": "player_character",
      "metadata": [
        "Race: Human",
        "Class: Ranger",
        "Skills: Tracking, Swordsmanship",
        "Affiliation: Fellowship of the Ring"
      ]
    }
```

#### Edges

Edges represent relationships between nodes. Each edge has:

* `from`: The name of the source node.
* `to`: The name of the target node.
* `edgeType`: The type of relationship (e.g., `owns`, `located_in`).

```json
{
  "from": "Aragorn",
  "to": "Andúril",
  "edgeType": "owns"
}
```

#### Schemas

Schemas are the heart of MemoryMesh. They define the structure of your data and drive the automatic generation of tools.

##### Schema File Location

Place your schema files (`.schema.json`) in the `dist/data/schemas` directory of your built MemoryMesh project. MemoryMesh will automatically detect and process these files on startup.

##### Schema Structure

File name: `[name].schema.json`. For example, for a schema defining an 'npc', the filename would be `add_npc.schema.json`.

* `name` - Identifier for the schema and node type within the memory. **IMPORTANT**: The schema’s name *must* start with `add_` to be recognized.
* `description` - Used as the description for the `add_<name>` tool, providing context for the AI. *(The `delete` and `update` tools have a generic description)*
* `properties` - Each property includes its type, description, and additional constraints.
    * `property`
        * `type` - Supported values are `string` or `array`.
        * `description` - Helps guide the AI on the entity’s purpose.
        * `required` - Boolean. If `true`, the **AI is forced** to provide this property when creating a node.
        * `enum` - An array of strings. If present, the **AI must choose** one of the given options.
        * `relationship` - Defines a connection to another node. If a property is required and has a relationship, the **AI will always create** both the node and the corresponding edge.
            * `edgeType` - Type of the relationship to be created.
            * `description` - Helps guide the AI on the relationship’s purpose.
* `additionalProperties` - Boolean. If `true`, allows the AI to add extra attributes beyond those defined as required or optional.

##### Example Schema (add_npc.schema.json):

```json
{
  "name": "add_npc",
  "description": "Schema for adding an NPC to the memory" ,
  "properties": {
    "name": {
      "type": "string",
      "description": "A unique identifier for the NPC",
      "required": true
    },
    "race": {
      "type": "string",
      "description": "The species or race of the NPC",
      "required": true,
      "enum": [
        "Human",
        "Elf",
        "Dwarf",
        "Orc",
        "Goblin"
      ]
    },
    "currentLocation": {
      "type": "string",
      "description": "The current location of the NPC",
      "required": true,
      "relationship": {
        "edgeType": "located_in",
        "description": "The current location of the NPC"
      }
    }
  },
  "additionalProperties": true
}
```

Based on this schema, MemoryMesh automatically creates:
* add_npc: To add new NPC nodes.
* update_npc: To modify existing NPC nodes.
* delete_npc: To remove NPC nodes.

MemoryMesh includes 11 pre-built schemas designed for text-based RPGs, providing a ready-to-use foundation for game development.

##### SchemaManager Tool

MemoryMesh includes a [SchemaManager tool](https://github.com/CheMiguel23/MemoryMesh/blob/main/SchemaManager.html) to simplify schema creation and editing. It provides a visual interface, making it easy to define your data structures without writing JSON directly.

<img width="370" alt="image" src="https://github.com/user-attachments/assets/e8f0c808-2ff6-48da-ac7c-cf51aebde7b8">

### Dynamic Tools

MemoryMesh simplifies interaction with your knowledge graph through **dynamic tools**. These tools are not manually coded but are **automatically generated** directly from your **schema definitions**. This means that when you define the structure of your data using schemas, MemoryMesh intelligently creates a set of tools tailored to work with that specific data structure.

**Think of it like this:** You provide a blueprint (the schema), and MemoryMesh automatically constructs the necessary tools to build, modify, and remove elements based on that blueprint.

#### How does it work behind the scenes?

MemoryMesh has an intelligent system that reads your schema definitions. It analyzes the structure you've defined, including the properties of your entities and their relationships. Based on this analysis, it automatically creates a set of tools for each entity type:

*   **`add_<entity>`:**  A tool for creating new instances of an entity.
*   **`update_<entity>`:** A tool for modifying existing entities.
*   **`delete_<entity>`:** A tool for removing entities.

These tools are then made available through a central hub within MemoryMesh, ensuring they can be easily accessed and used by any connected client or AI.

**In essence, MemoryMesh's dynamic tool system provides a powerful and efficient way to manage your knowledge graph, freeing you to focus on the content and logic of your application rather than the underlying mechanics of data manipulation.**

### Memory file

By default, data is stored in a JSON file in `dist/data/memory.json`.

#### Memory Viewer

The Memory Viewer is a separate tool designed to help you visualize and inspect the contents of the knowledge graph managed by MemoryMesh. It provides a user-friendly interface for exploring nodes, edges, and their properties.

##### Key Features:
* Graph Visualization: View the knowledge graph as an interactive node-link diagram.
* Node Inspection: Select nodes to see their nodeType, metadata, and connected edges.
* Edge Exploration: Examine relationships between nodes, including edgeType and direction.
* Search and Filtering: Quickly find specific nodes or filter them by type.
* Table View: Allows you to easily find and inspect specific nodes and edges, or all of them at once.
* Raw JSON View: Allows you to view the raw JSON data from the memory file.
* Stats Panel: Provides key metrics and information about the knowledge graph: total nodes, total edges, node types, and edge types.
* Search and Filter: Allows you to filter by node type or edge type and filter whether to show nodes, edges, or both.

##### Accessing the Memory Viewer
The Memory Viewer is a standalone web application. [Memory Viewer discussion](https://github.com/CheMiguel23/MemoryMesh/discussions/15)

##### Using the Memory Viewer
* Select Memory File: In the Memory Viewer, click the "Select Memory File" button.
* Choose File: Navigate to your MemoryMesh project directory and select the `memory.json` file (located in `dist/data/memory.json` by default).
* Explore: The Memory Viewer will load and display the contents of your knowledge graph.

## Memory Flow

![image](https://github.com/user-attachments/assets/27519003-c1e6-448a-9fdb-cd0a0009f67d)

## Prompt

For optimal results, use Claude's "Projects" feature with custom instructions. Here's an example of a prompt you can start with:

```
You are a helpful AI assistant managing a knowledge graph for a text-based RPG. You have access to the following tools: add_npc, update_npc, delete_npc, add_location, update_location, delete_location, and other tools for managing the game world.

When the user provides input, first process it using your available tools to update the knowledge graph. Then, respond in a way that is appropriate for a text-based RPG.
```

You can also instruct the AI to perform specific actions directly in the chat.

Experiment with different prompts to find what works best for your use case!

### Example
1. A [simple example](https://pastebin.com/0HvKg5FZ) with custom instructions.
2. An example for the sake of example, with visualization _(NOT part of the functionality)_

> Add a couple of cities, some npcs, couple locations around the city to explore, hide an artifact or two somewhere

![image](https://github.com/user-attachments/assets/508d5903-2896-4665-a892-cdb7b81dfba6)

## Installation

### Installing via Smithery

To install MemoryMesh for Claude Desktop automatically via [Smithery](https://smithery.ai/server/memorymesh):

```bash
npx -y @smithery/cli install memorymesh --client claude
```

### Prerequisites

*   **Node.js:** Version 18 or higher. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm:**  Usually included with Node.js.
*   **Claude for Desktop:**  Make sure you have the latest version installed from [claude.ai/download](https://claude.ai/download).

### Installation Steps

1. **Clone the Repository:**

    ```bash
    git clone https://github.com/CheMiguel23/memorymesh.git
    cd memorymesh
    ```

2. **Install Dependencies:**

    ```bash
    npm install
    ```

3. **Build the Project:**

    ```bash
    npm run build
    ```
   This command compiles the TypeScript code into JavaScript in the `dist` directory and copies sample schema and data files into it as well.

4. **Verify File Copy (Optional):**

    *   The build process should automatically copy the `data` folder to `dist`.
    *   **Check** that `dist/data` exists and contains `.json` files. Also verify that `dist/data/schemas` exists and contains `.schema.json` files.

5. **Configure Claude Desktop:**

   Open your Claude Desktop configuration file:

    * **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
    * **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
    * Add an entry for `memorymesh` to the `mcpServers` section. You can choose **one** of the following configuration options:

    ```json
    "mcpServers": {
      "memorymesh": {
        "command": "node", 
        "args": ["/ABSOLUTE/PATH/TO/YOUR/PROJECT/memorymesh/dist/index.js"]
      }
    }
    ```

    *   Replace `/ABSOLUTE/PATH/TO/YOUR/PROJECT/` with the **actual absolute path** to your `memorymesh` project directory.
    *   **Example (macOS):**
        ```json
        "command": "node",
        "args": ["/Users/yourusername/Projects/memorymesh/dist/index.js"]
        ```
    *   **Example (Windows):**
        ```json
        "command": "node",
        "args": ["C:\\Projects\\memorymesh\\dist\\index.js"]
        ```

6. **Restart Claude Desktop:** Completely restart Claude Desktop for the changes to take effect.

### Verify Installation

1. Start Claude Desktop.
2. Open a new chat.
3. Look for the MCP plugin icon <img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/claude-desktop-mcp-plug-icon.svg"/> in the top-right corner. If it's there, your configuration is likely correct.
4. Click the <img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/claude-desktop-mcp-plug-icon.svg"/> icon. You should see "memorymesh" in the list of connected servers.
5. Click the <img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/claude-desktop-mcp-hammer-icon.svg"/> icon. If you see tools listed (e.g., `add_npc`, `update_npc`, etc.), your server is working and exposing tools correctly.

### Updating
Before updates, make sure to back up your `dist/data` directory to avoid losing your memory data.

### Troubleshooting

*   **Server not appearing in Claude:**
    *   Double-check the paths in your `claude_desktop_config.json`. Make sure they are absolute paths and correct.
    *   Verify that the `dist` directory exists and contains the compiled JavaScript files, including `index.js`.
    *   Check the Claude Desktop logs for errors:
        *   **macOS:** `~/Library/Logs/Claude/mcp-server-memorymesh.log` (and `mcp.log`)
        *   **Windows:** (Likely in a `Logs` folder under `%AppData%\Claude`)

*   **Tools not showing up:**
    *   Make sure your `npm run build` command completed without errors.
    *   Verify that your schema files are correctly placed in `dist/data/schemas` and follow the correct naming convention (`add_[entity].schema.json`).
    *   Check your server's console output or logs for any errors during initialization.

## Advanced Configuration
MemoryMesh offers several ways to customize its behavior beyond the basic setup:

### Variables
You can override default settings using in `/config/config.ts`
* MEMORY_FILE: Specifies the path to the JSON file used for storing the knowledge graph data. (Default: `dist/data/memory.json`)
* SCHEMAS_DIR: Path to schema files directory. (Default: `dist/data/schemas/memory.json`)

## Limitations

1. **Node Deletion:** The AI may be hesitant to delete nodes from the knowledge graph. Encourage it through prompts if needed.

## Contribution

Contributions, feedback, and ideas are welcome!
This project is a personal exploration into integrating structured data with AI reasoning capabilities. Contributions, feedback, and ideas are welcome to push it further or inspire new projects.
