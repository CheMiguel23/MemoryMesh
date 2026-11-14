/** Built-in tools that work with any node type. */

import type {Tool, ToolAnnotations} from '@modelcontextprotocol/sdk/types.js';

/**
 * Hints that tell a client how careful it needs to be with a tool, e.g. whether to ask
 * the user before running it. Nothing here reaches outside the memory file, hence
 * openWorldHint: false everywhere.
 */
export const ANNOTATIONS = {
    /** Only reads the graph. */
    read: {readOnlyHint: true, openWorldHint: false},
    /** Only adds new things; fails rather than overwrite. */
    add: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false},
    /** Adds only what is missing, so repeating the call changes nothing more. */
    addOnce: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
    /** Replaces or removes existing data. Repeating the call changes nothing more. */
    change: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
} satisfies Record<string, ToolAnnotations>;

/**
 * The `fields` argument. The value type is described in words rather than with
 * "anyOf", which not every client accepts in a tool definition; the server checks it.
 */
const FIELDS = (description: string) => ({
    type: "object",
    description,
    properties: {},
    additionalProperties: {description: "A text, a number, true/false, or a list of texts"},
});

export const staticTools: Tool[] = [
    // --- Nodes and edges ---
    {
        name: "add_nodes",
        description: "Add multiple new nodes in the knowledge graph",
        annotations: ANNOTATIONS.add,
        inputSchema: {
            type: "object",
            properties: {
                nodes: {
                    type: "array",
                    description: "Array of nodes to add",
                    items: {
                        type: "object",
                        description: "Node to add",
                        properties: {
                            name: {type: "string", description: "The name of the node"},
                            nodeType: {type: "string", description: "The type of the node"},
                            fields: FIELDS("Structured facts about the node, e.g. {\"status\": \"injured\", \"traits\": [\"brave\"]}"),
                            metadata: {
                                type: "array",
                                items: {type: "string", description: "One note"},
                                description: "Free-form notes about the node"
                            },
                        },
                        required: ["name", "nodeType"],
                    },
                },
            },
            required: ["nodes"],
        },
    },

    {
        name: "update_nodes",
        description: "Update existing nodes in the knowledge graph: rename them, change their type, set fields, or replace their notes. Only what you pass is changed",
        annotations: ANNOTATIONS.change,
        inputSchema: {
            type: "object",
            properties: {
                nodes: {
                    type: "array",
                    description: "Array of nodes to update",
                    items: {
                        type: "object",
                        description: "Node to update",
                        properties: {
                            name: {type: "string", description: "The current name of the node to update"},
                            newName: {
                                type: "string",
                                description: "A new name for the node. Its edges, and metadata of linked nodes that refers to it by name, are updated to match"
                            },
                            nodeType: {type: "string", description: "The new type of the node"},
                            fields: FIELDS("Fields to set. Fields that are not mentioned keep their value; an empty value removes a field"),
                            metadata: {
                                type: "array",
                                items: {type: "string", description: "One note"},
                                description: "Free-form notes that replace all existing notes of the node"
                            },
                        },
                        required: ["name"],
                    },
                },
            },
            required: ["nodes"],
        },
    },

    {
        name: "add_edges",
        description: "Add multiple new edges between nodes in the knowledge graph. Edges should be in active voice",
        annotations: ANNOTATIONS.add,
        inputSchema: {
            type: "object",
            properties: {
                edges: {
                    type: "array",
                    description: "Array of edges to add",
                    items: {
                        type: "object",
                        description: "Edge to add",
                        properties: {
                            from: {type: "string", description: "The name of the node where the edge starts"},
                            to: {type: "string", description: "The name of the node where the edge ends"},
                            edgeType: {type: "string", description: "The type of the edge"},
                            weight: {
                                type: "number",
                                description: "Optional edge weight (0-1 range). Defaults to 1 if not specified",
                                minimum: 0,
                                maximum: 1
                            }
                        },
                        required: ["from", "to", "edgeType"],
                    },
                },
            },
            required: ["edges"],
        },
    },

    {
        name: "update_edges",
        description: "Update existing edges in the knowledge graph",
        annotations: ANNOTATIONS.change,
        inputSchema: {
            type: "object",
            properties: {
                edges: {
                    type: "array",
                    description: "Array of edges to update",
                    items: {
                        type: "object",
                        description: "Edge to update",
                        properties: {
                            from: {type: "string", description: "Current source node name"},
                            to: {type: "string", description: "Current target node name"},
                            edgeType: {type: "string", description: "Current edge type"},
                            newFrom: {type: "string", description: "New source node name"},
                            newTo: {type: "string", description: "New target node name"},
                            newEdgeType: {type: "string", description: "New edge type"},
                            newWeight: {
                                type: "number",
                                description: "Optional new edge weight (0-1 range)",
                                minimum: 0,
                                maximum: 1
                            }
                        },
                        required: ["from", "to", "edgeType"],
                    },
                },
            },
            required: ["edges"],
        },
    },

    {
        name: "delete_nodes",
        description: "Delete multiple nodes and their associated edges from the knowledge graph",
        annotations: ANNOTATIONS.change,
        inputSchema: {
            type: "object",
            properties: {
                nodeNames: {
                    type: "array",
                    items: {type: "string", description: "Node name to delete"},
                    description: "An array of node names to delete"
                },
            },
            required: ["nodeNames"],
        },
    },

    {
        name: "delete_edges",
        description: "Delete multiple edges from the knowledge graph",
        annotations: ANNOTATIONS.change,
        inputSchema: {
            type: "object",
            properties: {
                edges: {
                    type: "array",
                    description: "Array of edges to delete",
                    items: {
                        type: "object",
                        description: "Edge to delete",
                        properties: {
                            from: {type: "string", description: "The name of the node where the edge starts"},
                            to: {type: "string", description: "The name of the node where the edge ends"},
                            edgeType: {type: "string", description: "The type of the edge"},
                        },
                        required: ["from", "to", "edgeType"],
                    },
                },
            },
            required: ["edges"],
        },
    },

    // --- Reading ---
    {
        name: "read_graph",
        description: "Read the entire knowledge graph. On a large graph, prefer search_nodes or open_nodes to fetch only what is needed",
        annotations: ANNOTATIONS.read,
        inputSchema: {
            type: "object",
            properties: {},
        },
    },

    {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph. Returns the nodes that contain every word of the query in their name, type, fields or notes, plus their direct neighbours",
        annotations: ANNOTATIONS.read,
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "One or more words to match (case-insensitive) against node names, types, fields and notes"
                },
            },
            required: ["query"],
        },
    },

    {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        annotations: ANNOTATIONS.read,
        inputSchema: {
            type: "object",
            properties: {
                names: {
                    type: "array",
                    items: {type: "string", description: "Node name to open"},
                    description: "An array of node names to retrieve",
                },
            },
            required: ["names"],
        },
    },

    // --- Metadata ---
    {
        name: "add_metadata",
        description: "Add free-form notes (metadata) to existing nodes in the knowledge graph",
        annotations: ANNOTATIONS.addOnce,
        inputSchema: {
            type: "object",
            properties: {
                metadata: {
                    type: "array",
                    description: "Array of metadata to add",
                    items: {
                        type: "object",
                        description: "Metadata to add",
                        properties: {
                            nodeName: {type: "string", description: "The name of the node to add the metadata to"},
                            contents: {
                                type: "array",
                                items: {type: "string", description: "Metadata content item"},
                                description: "An array of metadata contents to add"
                            },
                        },
                        required: ["nodeName", "contents"],
                    },
                },
            },
            required: ["metadata"],
        },
    },

    {
        name: "delete_metadata",
        description: "Delete specific free-form notes (metadata) from nodes in the knowledge graph",
        annotations: ANNOTATIONS.change,
        inputSchema: {
            type: "object",
            properties: {
                deletions: {
                    type: "array",
                    description: "Array of metadata deletions",
                    items: {
                        type: "object",
                        description: "Metadata deletion",
                        properties: {
                            nodeName: {type: "string", description: "The name of the node containing the metadata"},
                            metadata: {
                                type: "array",
                                items: {type: "string", description: "Metadata item to delete"},
                                description: "An array of metadata to delete"
                            },
                        },
                        required: ["nodeName", "metadata"],
                    },
                },
            },
            required: ["deletions"],
        },
    }
];
