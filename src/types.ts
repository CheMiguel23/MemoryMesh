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
