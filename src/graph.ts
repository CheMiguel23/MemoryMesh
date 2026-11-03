/**
 * Pure operations on an in-memory graph.
 *
 * Every mutating function validates its whole input before changing anything
 * and throws an Error with a message meant for the AI if something is wrong.
 * Combined with GraphStore.update(), this makes every tool call all-or-nothing:
 * either all changes are saved, or none are.
 */

import type {Edge, EdgeUpdate, Graph, Node} from './types.js';

// ---------------------------------------------------------------------------
// Input checks (tool arguments come from an AI, so nothing can be assumed)
// ---------------------------------------------------------------------------

export function requireArray(value: unknown, what: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`"${what}" must be an array`);
    }
    return value;
}

function requireString(value: unknown, what: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${what} must be a non-empty string`);
    }
    return value;
}

function requireStringArray(value: unknown, what: string): string[] {
    const array = requireArray(value, what);
    if (array.some(item => typeof item !== 'string')) {
        throw new Error(`Every item in "${what}" must be a string`);
    }
    return array as string[];
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${what} must be an object`);
    }
    return value as Record<string, unknown>;
}

function checkWeight(weight: unknown): number | undefined {
    if (weight === undefined) return undefined;
    if (typeof weight !== 'number' || Number.isNaN(weight) || weight < 0 || weight > 1) {
        throw new Error('Edge weight must be a number between 0 and 1');
    }
    return weight;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findNode(graph: Graph, name: string): Node | undefined {
    return graph.nodes.find(node => node.name === name);
}

function requireNode(graph: Graph, name: string): Node {
    const node = findNode(graph, name);
    if (!node) {
        throw new Error(`Node not found: "${name}"`);
    }
    return node;
}

const sameEdge = (a: Pick<Edge, 'from' | 'to' | 'edgeType'>, b: Pick<Edge, 'from' | 'to' | 'edgeType'>) =>
    a.from === b.from && a.to === b.to && a.edgeType === b.edgeType;

const describeEdge = (edge: Pick<Edge, 'from' | 'to' | 'edgeType'>) =>
    `${edge.from} -[${edge.edgeType}]-> ${edge.to}`;

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export function addNodes(graph: Graph, input: unknown): Node[] {
    const added: Node[] = [];
    for (const [i, raw] of requireArray(input, 'nodes').entries()) {
        const item = requireObject(raw, `nodes[${i}]`);
        const node: Node = {
            type: 'node',
            name: requireString(item.name, `nodes[${i}].name`),
            nodeType: requireString(item.nodeType, `nodes[${i}].nodeType`),
            metadata: requireStringArray(item.metadata ?? [], `nodes[${i}].metadata`),
        };
        if (findNode(graph, node.name) || added.some(n => n.name === node.name)) {
            throw new Error(`Node already exists: "${node.name}". Update it instead of adding it again.`);
        }
        added.push(node);
    }
    graph.nodes.push(...added);
    return added;
}

export function updateNodes(graph: Graph, input: unknown): Node[] {
    const updated: Node[] = [];
    for (const [i, raw] of requireArray(input, 'nodes').entries()) {
        const item = requireObject(raw, `nodes[${i}]`);
        const node = requireNode(graph, requireString(item.name, `nodes[${i}].name`));
        if (item.nodeType !== undefined) {
            node.nodeType = requireString(item.nodeType, `nodes[${i}].nodeType`);
        }
        if (item.metadata !== undefined) {
            node.metadata = requireStringArray(item.metadata, `nodes[${i}].metadata`);
        }
        updated.push(node);
    }
    return updated;
}

/** Deletes nodes and every edge touching them. Returns the names that existed. */
export function deleteNodes(graph: Graph, input: unknown): string[] {
    const names = new Set(requireStringArray(input, 'nodeNames'));
    const deleted = graph.nodes.filter(node => names.has(node.name)).map(node => node.name);
    graph.nodes = graph.nodes.filter(node => !names.has(node.name));
    graph.edges = graph.edges.filter(edge => !names.has(edge.from) && !names.has(edge.to));
    return deleted;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export function addEdges(graph: Graph, input: unknown): Edge[] {
    const added: Edge[] = [];
    for (const [i, raw] of requireArray(input, 'edges').entries()) {
        const item = requireObject(raw, `edges[${i}]`);
        const edge: Edge = {
            type: 'edge',
            from: requireString(item.from, `edges[${i}].from`),
            to: requireString(item.to, `edges[${i}].to`),
            edgeType: requireString(item.edgeType, `edges[${i}].edgeType`),
        };
        const weight = checkWeight(item.weight);
        if (weight !== undefined) edge.weight = weight;

        requireNode(graph, edge.from);
        requireNode(graph, edge.to);
        if (graph.edges.some(e => sameEdge(e, edge)) || added.some(e => sameEdge(e, edge))) {
            throw new Error(`Edge already exists: ${describeEdge(edge)}`);
        }
        added.push(edge);
    }
    graph.edges.push(...added);
    return added;
}

export function updateEdges(graph: Graph, input: unknown): Edge[] {
    const updated: Edge[] = [];
    for (const [i, raw] of requireArray(input, 'edges').entries()) {
        const item = requireObject(raw, `edges[${i}]`) as Partial<Record<keyof EdgeUpdate, unknown>>;
        const current = {
            from: requireString(item.from, `edges[${i}].from`),
            to: requireString(item.to, `edges[${i}].to`),
            edgeType: requireString(item.edgeType, `edges[${i}].edgeType`),
        };
        const edge = graph.edges.find(e => sameEdge(e, current));
        if (!edge) {
            throw new Error(`Edge not found: ${describeEdge(current)}`);
        }

        const next: Edge = {
            type: 'edge',
            from: item.newFrom !== undefined ? requireString(item.newFrom, `edges[${i}].newFrom`) : edge.from,
            to: item.newTo !== undefined ? requireString(item.newTo, `edges[${i}].newTo`) : edge.to,
            edgeType: item.newEdgeType !== undefined
                ? requireString(item.newEdgeType, `edges[${i}].newEdgeType`)
                : edge.edgeType,
        };
        const weight = item.newWeight !== undefined ? checkWeight(item.newWeight) : edge.weight;
        if (weight !== undefined) next.weight = weight;

        requireNode(graph, next.from);
        requireNode(graph, next.to);
        if (!sameEdge(edge, next) && graph.edges.some(e => sameEdge(e, next))) {
            throw new Error(`Edge already exists: ${describeEdge(next)}`);
        }

        Object.assign(edge, next);
        if (weight === undefined) delete edge.weight;
        updated.push(edge);
    }
    return updated;
}

/** Deletes matching edges. Returns how many were removed. */
export function deleteEdges(graph: Graph, input: unknown): number {
    const targets = requireArray(input, 'edges').map((raw, i) => {
        const item = requireObject(raw, `edges[${i}]`);
        return {
            from: requireString(item.from, `edges[${i}].from`),
            to: requireString(item.to, `edges[${i}].to`),
            edgeType: requireString(item.edgeType, `edges[${i}].edgeType`),
        };
    });
    const before = graph.edges.length;
    graph.edges = graph.edges.filter(edge => !targets.some(target => sameEdge(edge, target)));
    return before - graph.edges.length;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function addMetadata(graph: Graph, input: unknown): { nodeName: string; addedMetadata: string[] }[] {
    return requireArray(input, 'metadata').map((raw, i) => {
        const item = requireObject(raw, `metadata[${i}]`);
        const node = requireNode(graph, requireString(item.nodeName, `metadata[${i}].nodeName`));
        const contents = requireStringArray(item.contents, `metadata[${i}].contents`);
        const added = [...new Set(contents)].filter(entry => !node.metadata.includes(entry));
        node.metadata.push(...added);
        return {nodeName: node.name, addedMetadata: added};
    });
}

/** Removes exact metadata entries. Returns how many were removed. */
export function deleteMetadata(graph: Graph, input: unknown): number {
    let removed = 0;
    for (const [i, raw] of requireArray(input, 'deletions').entries()) {
        const item = requireObject(raw, `deletions[${i}]`);
        const node = requireNode(graph, requireString(item.nodeName, `deletions[${i}].nodeName`));
        const toRemove = new Set(requireStringArray(item.metadata, `deletions[${i}].metadata`));
        const before = node.metadata.length;
        node.metadata = node.metadata.filter(entry => !toRemove.has(entry));
        removed += before - node.metadata.length;
    }
    return removed;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Returns the given nodes plus their direct neighbours and the edges connecting them. */
function withNeighbours(graph: Graph, matches: Node[]): Graph {
    const matched = new Set(matches.map(node => node.name));
    const edges = graph.edges.filter(edge => matched.has(edge.from) || matched.has(edge.to));
    const neighbourNames = new Set(edges.flatMap(edge => [edge.from, edge.to]));
    const neighbours = graph.nodes.filter(node => !matched.has(node.name) && neighbourNames.has(node.name));
    return {nodes: [...matches, ...neighbours], edges};
}

/** Case-insensitive search over node names, types and metadata. */
export function searchNodes(graph: Graph, query: unknown): Graph {
    const q = requireString(query, '"query"').toLowerCase();
    const matches = graph.nodes.filter(node =>
        node.name.toLowerCase().includes(q) ||
        node.nodeType.toLowerCase().includes(q) ||
        node.metadata.some(entry => entry.toLowerCase().includes(q))
    );
    return withNeighbours(graph, matches);
}

export function openNodes(graph: Graph, names: unknown): Graph {
    const wanted = new Set(requireStringArray(names, 'names'));
    return withNeighbours(graph, graph.nodes.filter(node => wanted.has(node.name)));
}
