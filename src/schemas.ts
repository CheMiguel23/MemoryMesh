/**
 * Schema-driven tools.
 *
 * Each `<entity>.schema.json` file describes a node type (npc, location, ...).
 * For every schema MemoryMesh exposes three tools:
 *   add_<entity>, update_<entity>, delete_<entity>
 *
 * Schema file format:
 * {
 *   "name": "add_npc",                 // must start with "add_"
 *   "description": "...",              // description of the add_ tool
 *   "properties": {
 *     "currentLocation": {
 *       "type": "string" | "array",
 *       "description": "...",
 *       "required": true,              // optional
 *       "enum": ["a", "b"],            // optional
 *       "relationship": {              // optional: also creates an edge to the named node(s)
 *         "edgeType": "located_in",
 *         "description": "..."
 *       }
 *     }
 *   },
 *   "additionalProperties": true       // optional: allow fields not listed above
 * }
 */

import {promises as fs} from 'fs';
import path from 'path';
import {addEdges, deleteNodes, findNode, requireArray} from './graph.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {Edge, Graph, Node} from './types.js';

export interface SchemaProperty {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
    relationship?: {
        edgeType: string;
        description?: string;
    };
}

export interface EntitySchema {
    /** Node type and tool suffix, e.g. "npc" for add_npc. */
    entity: string;
    description: string;
    properties: Record<string, SchemaProperty>;
    additionalProperties?: boolean;
}

/** Tool names that schema-generated tools must not take over. */
const RESERVED_ENTITIES = new Set(['nodes', 'edges', 'metadata']);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Validates a parsed schema file and converts it to an EntitySchema. */
export function parseSchema(raw: any): EntitySchema {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('schema must be a JSON object');
    }
    if (typeof raw.name !== 'string' || !/^add_[A-Za-z0-9_-]+$/.test(raw.name)) {
        throw new Error('"name" must start with "add_" followed by letters, digits, "_" or "-" (e.g. "add_npc")');
    }
    const entity = raw.name.slice('add_'.length);
    if (RESERVED_ENTITIES.has(entity)) {
        throw new Error(`"${raw.name}" clashes with a built-in tool; choose another name`);
    }
    if (typeof raw.description !== 'string' || raw.description === '') {
        throw new Error('"description" is required');
    }
    if (typeof raw.properties !== 'object' || raw.properties === null) {
        throw new Error('"properties" must be an object');
    }
    for (const [prop, config] of Object.entries<any>(raw.properties)) {
        if (!config?.type || !config?.description) {
            throw new Error(`property "${prop}" must have a type and a description`);
        }
        if (config.relationship && !config.relationship.edgeType) {
            throw new Error(`property "${prop}" has a relationship without an edgeType`);
        }
    }
    return {
        entity,
        description: raw.description,
        properties: raw.properties,
        additionalProperties: raw.additionalProperties,
    };
}

/**
 * Loads every *.schema.json file in a directory.
 * A broken file is reported on stderr and skipped, so one bad schema
 * does not stop the server (and all other tools) from starting.
 */
export async function loadSchemas(dir: string): Promise<EntitySchema[]> {
    let files: string[];
    try {
        files = (await fs.readdir(dir)).filter(file => file.endsWith('.schema.json')).sort();
    } catch (error) {
        console.error(`[memorymesh] Could not read schemas directory ${dir}: ${(error as Error).message}`);
        return [];
    }

    const schemas: EntitySchema[] = [];
    for (const file of files) {
        try {
            const schema = parseSchema(JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')));
            if (schemas.some(s => s.entity === schema.entity)) {
                throw new Error(`another schema already defines "add_${schema.entity}"`);
            }
            schemas.push(schema);
        } catch (error) {
            console.error(`[memorymesh] Skipping schema ${file}: ${(error as Error).message}`);
        }
    }
    return schemas;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function toJsonSchema(name: string, prop: SchemaProperty): Record<string, unknown> {
    const item = (extra: object = {}) => ({type: 'string', description: `Item in ${name} array`, ...extra});
    if (prop.relationship) {
        // Relationship fields accept one or more target node names.
        return {type: 'array', description: prop.relationship.description ?? prop.description, items: item()};
    }
    if (prop.type === 'array') {
        return {type: 'array', description: prop.description, items: item(prop.enum ? {enum: prop.enum} : {})};
    }
    return {type: 'string', description: prop.description, ...(prop.enum ? {enum: prop.enum} : {})};
}

function propertiesFor(schema: EntitySchema): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    if (!schema.properties.name) {
        properties.name = {type: 'string', description: `The unique name of the ${schema.entity}`};
    }
    for (const [name, prop] of Object.entries(schema.properties)) {
        properties[name] = toJsonSchema(name, prop);
    }
    return properties;
}

const additional = (schema: EntitySchema) =>
    schema.additionalProperties === false ? false : {type: 'string', description: 'Additional property value'};

export function schemaTools(schema: EntitySchema): Tool[] {
    const {entity} = schema;
    const required = ['name', ...Object.keys(schema.properties).filter(
        name => name !== 'name' && schema.properties[name].required
    )];

    return [
        {
            name: `add_${entity}`,
            description: schema.description,
            inputSchema: {
                type: 'object',
                properties: {
                    [entity]: {
                        type: 'object',
                        properties: propertiesFor(schema),
                        required,
                        additionalProperties: additional(schema),
                    },
                },
                required: [entity],
            },
        },
        {
            name: `update_${entity}`,
            description: `Update an existing ${entity} in the knowledge graph`,
            inputSchema: {
                type: 'object',
                properties: {
                    [`update_${entity}`]: {
                        type: 'object',
                        properties: {
                            ...propertiesFor(schema),
                            metadata: {
                                type: 'array',
                                description: 'An array of metadata contents to replace the existing metadata',
                                items: {type: 'string', description: 'Item in metadata array'},
                            },
                        },
                        required: ['name'],
                        additionalProperties: additional(schema),
                    },
                },
                required: [`update_${entity}`],
            },
        },
        {
            name: `delete_${entity}`,
            description: `Delete an existing ${entity} from the knowledge graph`,
            inputSchema: {
                type: 'object',
                properties: {
                    [`delete_${entity}`]: {
                        type: 'object',
                        description: `Delete parameters for ${entity}`,
                        properties: {
                            name: {type: 'string', description: `The name of the ${entity} to delete`},
                        },
                        required: ['name'],
                    },
                },
                required: [`delete_${entity}`],
            },
        },
    ];
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function requireEntityArgs(value: unknown, key: string, entity: string): Record<string, unknown> & { name: string } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Missing argument "${key}". Expected: { "${key}": { "name": "...", ... } }`);
    }
    const args = value as Record<string, unknown>;
    if (typeof args.name !== 'string' || args.name.trim() === '') {
        throw new Error(`"name" is required to identify the ${entity}`);
    }
    return args as Record<string, unknown> & { name: string };
}

function rejectUnknownFields(schema: EntitySchema, args: Record<string, unknown>, allowed: string[] = []): void {
    if (schema.additionalProperties !== false) return;
    const unknown = Object.keys(args).filter(
        key => key !== 'name' && !allowed.includes(key) && !(key in schema.properties)
    );
    if (unknown.length > 0) {
        throw new Error(`Unknown field(s) for ${schema.entity}: ${unknown.join(', ')}`);
    }
}

function formatValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(formatValue).join(', ');
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return String(value);
}

function metadataKey(entry: string): string | null {
    const colon = entry.indexOf(':');
    return colon === -1 ? null : entry.slice(0, colon).trim().toLowerCase();
}

/** Sets "key: value" in a metadata list, replacing an existing entry for the same key (case-insensitive). */
function setMetadata(metadata: string[], key: string, value: string): string[] {
    const entry = `${key}: ${value}`;
    const matches = (e: string) => metadataKey(e) === key.toLowerCase();
    const index = metadata.findIndex(matches);
    if (index === -1) return [...metadata, entry];
    return metadata.flatMap((e, i) => (i === index ? [entry] : matches(e) ? [] : [e]));
}

/** Builds the edges a relationship field implies, checking every target exists first. */
function relationshipEdges(graph: Graph, from: string, field: string, edgeType: string, value: unknown): Edge[] {
    const targets = typeof value === 'string' ? [value] : requireArray(value, field);
    return [...new Set(targets)].map(target => {
        if (typeof target !== 'string' || target.trim() === '') {
            throw new Error(`Every value in "${field}" must be a node name`);
        }
        if (!findNode(graph, target)) {
            throw new Error(
                `Cannot link "${from}" to "${target}" via "${field}": no node named "${target}" exists. ` +
                `Create it first, or leave "${field}" out.`
            );
        }
        return {type: 'edge', from, to: target, edgeType};
    });
}

const isSet = (value: unknown) => value !== undefined && value !== null;

export function addEntity(graph: Graph, schema: EntitySchema, input: unknown): { node: Node; edges: Edge[] } {
    const {entity, properties} = schema;
    const args = requireEntityArgs(input, entity, entity);
    rejectUnknownFields(schema, args);

    const existing = findNode(graph, args.name);
    if (existing) {
        throw new Error(`Node already exists: "${args.name}" (${existing.nodeType}). Update it instead of adding it again.`);
    }
    const missing = Object.keys(properties).filter(field => properties[field].required && !isSet(args[field]));
    if (missing.length > 0) {
        throw new Error(`Missing required field(s) for ${entity}: ${missing.join(', ')}`);
    }

    // Schema fields first (in schema order), then any extra fields.
    const fields = [...Object.keys(properties), ...Object.keys(args).filter(key => !(key in properties) && key !== 'name')];
    const metadata: string[] = [];
    const edges: Edge[] = [];
    for (const field of fields) {
        const value = args[field];
        if (!isSet(value)) continue;
        metadata.push(`${field}: ${formatValue(value)}`);
        const relationship = properties[field]?.relationship;
        if (relationship) {
            edges.push(...relationshipEdges(graph, args.name, field, relationship.edgeType, value));
        }
    }

    const node: Node = {type: 'node', name: args.name, nodeType: entity, metadata};
    graph.nodes.push(node);
    addEdges(graph, edges);
    return {node, edges};
}

export function updateEntity(
    graph: Graph,
    schema: EntitySchema,
    input: unknown
): { node: Node; removedEdges: Edge[]; addedEdges: Edge[] } {
    const {entity, properties} = schema;
    const args = requireEntityArgs(input, `update_${entity}`, entity);
    rejectUnknownFields(schema, args, ['metadata']);

    const node = findNode(graph, args.name);
    if (!node || node.nodeType !== entity) {
        const hint = node ? ` ("${args.name}" is a ${node.nodeType})` : '';
        throw new Error(`${entity} "${args.name}" not found${hint}`);
    }

    // "metadata" replaces the whole list; individual fields then update their own entries.
    let metadata = isSet(args.metadata) ? requireArray(args.metadata, 'metadata').map(String) : [...node.metadata];
    const removedEdges: Edge[] = [];
    const addedEdges: Edge[] = [];

    for (const [field, value] of Object.entries(args)) {
        if (field === 'name' || field === 'metadata' || !isSet(value)) continue;
        metadata = setMetadata(metadata, field, formatValue(value));

        const relationship = properties[field]?.relationship;
        if (relationship) {
            const newEdges = relationshipEdges(graph, node.name, field, relationship.edgeType, value);
            const old = graph.edges.filter(e => e.from === node.name && e.edgeType === relationship.edgeType);
            graph.edges = graph.edges.filter(e => !old.includes(e));
            removedEdges.push(...old);
            addedEdges.push(...addEdges(graph, newEdges));
        }
    }

    node.metadata = metadata;
    return {node, removedEdges, addedEdges};
}

export function deleteEntity(graph: Graph, schema: EntitySchema, input: unknown): string {
    const args = requireEntityArgs(input, `delete_${schema.entity}`, schema.entity);
    const node = findNode(graph, args.name);
    if (!node || node.nodeType !== schema.entity) {
        throw new Error(`${schema.entity} "${args.name}" not found`);
    }
    deleteNodes(graph, [node.name]);
    return node.name;
}
