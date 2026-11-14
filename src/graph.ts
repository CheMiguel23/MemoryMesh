/**
 * Pure operations on an in-memory graph.
 *
 * Every mutating function validates its whole input before changing anything
 * and throws an Error with a message meant for the AI if something is wrong.
 * Combined with GraphStore.update(), this makes every tool call all-or-nothing:
 * either all changes are saved, or none are.
 */

import type {Edge, FieldValue, Graph, Node} from './types.js';

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

/** True for values that mean "nothing": blank text or an empty list. */
export const isBlank = (value: unknown) =>
    (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);

function requireFields(value: unknown, what: string): Record<string, FieldValue> {
    const fields = requireObject(value, what);
    for (const [key, item] of Object.entries(fields)) {
        const isScalar = typeof item === 'string' || typeof item === 'boolean' ||
            (typeof item === 'number' && Number.isFinite(item));
        const isTextList = Array.isArray(item) && item.every(entry => typeof entry === 'string');
        if (!isScalar && !isTextList) {
            throw new Error(`${what}.${key} must be a string, a number, true/false, or an array of strings`);
        }
    }
    return fields as Record<string, FieldValue>;
}

/** Sets one field of a node. A blank value removes the field. */
export function setField(node: Node, key: string, value: FieldValue): void {
    const fields = {...node.fields};
    if (isBlank(value)) delete fields[key];
    else fields[key] = value;

    // Re-added in this order so that "fields" comes before "metadata" wherever the node is shown.
    const {metadata} = node;
    delete node.fields;
    delete (node as Partial<Node>).metadata;
    if (Object.keys(fields).length > 0) node.fields = fields;
    node.metadata = metadata;
}

/** A node's fields written the way notes are, e.g. "traits: brave, stubborn". Used for searching. */
function fieldLines(node: Node): string[] {
    return Object.entries(node.fields ?? {}).map(([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(', ') : value}`
    );
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
            // Trimmed, so that " Mara " cannot be created next to "Mara".
            name: requireString(item.name, `nodes[${i}].name`).trim(),
            nodeType: requireString(item.nodeType, `nodes[${i}].nodeType`),
            metadata: requireStringArray(item.metadata ?? [], `nodes[${i}].metadata`),
        };
        if (item.fields !== undefined) {
            for (const [key, value] of Object.entries(requireFields(item.fields, `nodes[${i}].fields`))) {
                setField(node, key, value);
            }
        }
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
        if (item.fields !== undefined) {
            // Only the fields that are passed change; a blank value removes one.
            for (const [key, value] of Object.entries(requireFields(item.fields, `nodes[${i}].fields`))) {
                setField(node, key, value);
            }
        }
        if (item.newName !== undefined) {
            renameNode(graph, node, requireString(item.newName, `nodes[${i}].newName`).trim());
        }
        updated.push(node);
    }
    return updated;
}

/** Rewrites the value of a "key: value" metadata entry; entries without a colon are left alone. */
function mapMetadataValue(entry: string, change: (key: string, value: string) => string): string {
    const colon = entry.indexOf(':');
    if (colon === -1) return entry;
    const key = entry.slice(0, colon);
    const value = entry.slice(colon + 1).trim();
    const changed = change(key.trim().toLowerCase(), value);
    return changed === value ? entry : `${key}: ${changed}`;
}

/**
 * Renames a node everywhere it is referred to:
 *  - the edges that start or end at it,
 *  - notes written by older versions, which kept a copy of names in metadata: the
 *    node's own "name: ..." entry, and entries such as "currentLocation: Town" or
 *    "allies: Ann, Town" on nodes linking to it.
 */
function renameNode(graph: Graph, node: Node, newName: string): void {
    const oldName = node.name;
    if (newName === oldName) return;
    if (findNode(graph, newName)) {
        throw new Error(`Cannot rename "${oldName}" to "${newName}": a node with that name already exists`);
    }

    const linkingToIt = new Set(graph.edges.filter(edge => edge.to === oldName).map(edge => edge.from));
    for (const other of graph.nodes) {
        if (other === node || !linkingToIt.has(other.name)) continue;
        other.metadata = other.metadata.map(entry => mapMetadataValue(entry, (_key, value) =>
            value.split(', ').map(item => (item === oldName ? newName : item)).join(', ')
        ));
    }
    node.metadata = node.metadata.map(entry => mapMetadataValue(entry, (key, value) =>
        key === 'name' && value === oldName ? newName : value
    ));
    for (const edge of graph.edges) {
        if (edge.from === oldName) edge.from = newName;
        if (edge.to === oldName) edge.to = newName;
    }
    node.name = newName;
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
        const item = requireObject(raw, `edges[${i}]`);
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

/**
 * Case-insensitive search over node names, types, fields, notes and outgoing edges.
 * A node matches when every word of the query appears somewhere in those.
 */
export function searchNodes(graph: Graph, query: unknown): Graph {
    const words = requireString(query, '"query"').toLowerCase().split(/\s+/).filter(word => word !== '');

    // What a node links to is part of what it is: "blacksmith riverton" should find
    // the blacksmith whose only mention of Riverton is a located_in edge.
    const links = new Map<string, string[]>();
    for (const edge of graph.edges) {
        links.set(edge.from, [...(links.get(edge.from) ?? []), `${edge.edgeType}: ${edge.to}`]);
    }

    const matches = graph.nodes.filter(node => {
        const own = [node.name, node.nodeType, ...fieldLines(node), ...node.metadata].join('\n').toLowerCase();
        const linked = (links.get(node.name) ?? []).join('\n').toLowerCase();
        // At least one word must be about the node itself. Otherwise searching for "Riverton"
        // would match everything that links to Riverton, and then pull in all of their neighbours too.
        return words.some(word => own.includes(word)) &&
            words.every(word => own.includes(word) || linked.includes(word));
    });
    return withNeighbours(graph, matches);
}

export function openNodes(graph: Graph, names: unknown): Graph {
    const wanted = new Set(requireStringArray(names, 'names'));
    return withNeighbours(graph, graph.nodes.filter(node => wanted.has(node.name)));
}
