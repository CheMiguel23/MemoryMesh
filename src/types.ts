/** A node (entity) in the knowledge graph. */
export interface Node {
    type: 'node';
    name: string;
    nodeType: string;
    /** Free-form facts about the node, usually written as "key: value". */
    metadata: string[];
}

/** A directed relationship between two nodes. */
export interface Edge {
    type: 'edge';
    from: string;
    to: string;
    edgeType: string;
    /** Optional strength/confidence of the relationship, 0-1. Treated as 1 when absent. */
    weight?: number;
}

export interface Graph {
    nodes: Node[];
    edges: Edge[];
}

/** Identifies an existing edge and the changes to apply to it. */
export interface EdgeUpdate {
    from: string;
    to: string;
    edgeType: string;
    newFrom?: string;
    newTo?: string;
    newEdgeType?: string;
    newWeight?: number;
}

/** An MCP tool definition as advertised in tools/list. */
export interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
