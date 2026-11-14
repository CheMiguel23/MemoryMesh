/** The value of a structured field: a text, a number, true/false, or a list of texts. */
export type FieldValue = string | number | boolean | string[];

/** A node (entity) in the knowledge graph. */
export interface Node {
    type: 'node';
    name: string;
    nodeType: string;
    /**
     * Structured facts about the node, keyed by field name, e.g.
     * {"status": "injured", "traits": ["brave", "stubborn"]}.
     * The schema tools store their fields here. Left out when there are none.
     */
    fields?: Record<string, FieldValue>;
    /** Free-form notes about the node. */
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
