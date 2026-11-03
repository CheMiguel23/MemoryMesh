/** Built-in tools that work with any node type. */

import type {Tool} from './types.js';

export const staticTools: Tool[] = [
    // --- Nodes and edges ---
    {
        name: "add_nodes",
        description: "Add multiple new nodes in the knowledge graph",
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
                            metadata: {
                                type: "array",
                                items: {type: "string", description: "Metadata item"},
                                description: "An array of metadata contents associated with the node"
                            },
                        },
                        required: ["name", "nodeType", "metadata"],
                    },
                },
            },
            required: ["nodes"],
        },
    },

    {
        name: "update_nodes",
        description: "Update existing nodes in the knowledge graph",
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
                            name: {type: "string", description: "The name of the node to update"},
                            nodeType: {type: "string", description: "The new type of the node"},
                            metadata: {
                                type: "array",
                                items: {type: "string", description: "Metadata item"},
                                description: "An array of new metadata contents for the node"
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
        description: "Read the entire knowledge graph",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },

    {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query to match against node names, types, and metadata content"
                },
            },
            required: ["query"],
        },
    },

    {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
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
        description: "Add new metadata to existing nodes in the knowledge graph",
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
        description: "Delete specific metadata from nodes in the knowledge graph",
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
