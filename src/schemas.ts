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
import {addEdges, deleteNodes, findNode, isBlank, requireArray, setField} from './graph.js';
import {ANNOTATIONS} from './tools.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {Edge, FieldValue, Graph, Node} from './types.js';

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

/** Longest tool name AI clients reliably accept. The longest generated name is "update_<entity>". */
const MAX_TOOL_NAME_LENGTH = 64;
const MAX_ENTITY_LENGTH = MAX_TOOL_NAME_LENGTH - 'update_'.length;

const PROPERTY_TYPES = ['string', 'array'];

const isPlainObject = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Validates a parsed schema file and converts it to an EntitySchema. */
export function parseSchema(raw: any): EntitySchema {
    if (!isPlainObject(raw)) {
        throw new Error('schema must be a JSON object');
    }
    if (typeof raw.name !== 'string' || !/^add_[A-Za-z0-9_-]+$/.test(raw.name)) {
        throw new Error('"name" must start with "add_" followed by letters, digits, "_" or "-" (e.g. "add_npc")');
    }
    const entity = raw.name.slice('add_'.length);
    if (RESERVED_ENTITIES.has(entity)) {
        throw new Error(`"${raw.name}" clashes with a built-in tool; choose another name`);
    }
    if (entity.length > MAX_ENTITY_LENGTH) {
        throw new Error(`"name" is too long: use at most ${MAX_ENTITY_LENGTH} characters after "add_"`);
    }
    if (!isNonEmptyString(raw.description)) {
        throw new Error('"description" is required');
    }
    if (!isPlainObject(raw.properties)) {
        throw new Error('"properties" must be an object');
    }
    // Anything wrong here would end up in the tool definitions sent to the client,
    // where one malformed tool can make the client reject all of them.
    for (const [prop, config] of Object.entries<any>(raw.properties)) {
        if (!isPlainObject(config) || !isNonEmptyString(config.type) || !isNonEmptyString(config.description)) {
            throw new Error(`property "${prop}" must have a type and a description`);
        }
        if (config.enum !== undefined &&
            (!Array.isArray(config.enum) || config.enum.length === 0 || !config.enum.every(isNonEmptyString))) {
            throw new Error(`property "${prop}": "enum" must be a list of at least one text value`);
        }
        if (config.relationship !== undefined && config.relationship !== null && config.relationship !== false) {
            if (!isPlainObject(config.relationship) || !isNonEmptyString(config.relationship.edgeType)) {
                throw new Error(`property "${prop}" has a relationship without an edgeType`);
            }
            if (config.relationship.description !== undefined && typeof config.relationship.description !== 'string') {
                throw new Error(`property "${prop}": the relationship "description" must be text`);
            }
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
 * Things in a valid schema that probably do not do what its author expects.
 * They are logged when the schema is loaded; the schema still works.
 */
export function schemaWarnings(schema: EntitySchema): string[] {
    const warnings: string[] = [];
    const fieldsByEdgeType = new Map<string, string[]>();

    for (const [name, prop] of Object.entries(schema.properties)) {
        if (!PROPERTY_TYPES.includes(prop.type)) {
            warnings.push(`property "${name}" has type "${prop.type}", which is treated as "string" (use "string" or "array")`);
        }
        if (name === 'metadata') {
            warnings.push(`property "metadata" clashes with the "metadata" argument of update_${schema.entity}, which replaces all metadata; rename it`);
        }
        if (prop.relationship) {
            const fields = fieldsByEdgeType.get(prop.relationship.edgeType) ?? [];
            fieldsByEdgeType.set(prop.relationship.edgeType, [...fields, name]);
        }
    }
    for (const [edgeType, fields] of fieldsByEdgeType) {
        if (fields.length > 1) {
            warnings.push(
                `properties ${fields.map(f => `"${f}"`).join(' and ')} share the edgeType "${edgeType}", ` +
                `so updating one removes the edges of the other; give each its own edgeType`
            );
        }
    }
    return warnings;
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
            for (const warning of schemaWarnings(schema)) {
                console.error(`[memorymesh] Schema ${file}: ${warning}`);
            }
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

const notesProperty = (description: string) => ({
    type: 'array',
    description,
    items: {type: 'string', description: 'One note'},
});

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
            annotations: ANNOTATIONS.add,
            inputSchema: {
                type: 'object',
                properties: {
                    [entity]: {
                        type: 'object',
                        properties: {
                            ...propertiesFor(schema),
                            metadata: notesProperty('Free-form notes that do not fit any of the fields'),
                        },
                        required,
                        additionalProperties: additional(schema),
                    },
                },
                required: [entity],
            },
        },
        {
            name: `update_${entity}`,
            description: `Update an existing ${entity} in the knowledge graph. Only the fields you pass are changed; pass an empty value to clear a field`,
            annotations: ANNOTATIONS.change,
            inputSchema: {
                type: 'object',
                properties: {
                    [`update_${entity}`]: {
                        type: 'object',
                        properties: {
                            ...propertiesFor(schema),
                            metadata: notesProperty('Free-form notes. Replaces all existing notes of the node'),
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
            annotations: ANNOTATIONS.change,
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

/** Arguments of the schema tools that are not fields of the entity. */
const NOT_FIELDS = ['name', 'metadata'];

function rejectUnknownFields(schema: EntitySchema, args: Record<string, unknown>): void {
    if (schema.additionalProperties !== false) return;
    const unknown = Object.keys(args).filter(key => !NOT_FIELDS.includes(key) && !(key in schema.properties));
    if (unknown.length > 0) {
        throw new Error(`Unknown field(s) for ${schema.entity}: ${unknown.join(', ')}`);
    }
}

const isSet = (value: unknown) => value !== undefined && value !== null;

/** True when a field was given a value worth storing (blank text and empty lists are not). */
const hasValue = (value: unknown) => isSet(value) && !isBlank(value);

/** Tool arguments are not validated by the client or the SDK, so enums are enforced here. */
function rejectInvalidEnumValues(schema: EntitySchema, args: Record<string, unknown>): void {
    for (const [field, prop] of Object.entries(schema.properties)) {
        // Relationship fields hold node names, so their enum is not advertised or enforced.
        if (!prop.enum || prop.relationship || !hasValue(args[field])) continue;
        const value = args[field];
        const invalid = (Array.isArray(value) ? value : [value]).filter(item => !prop.enum!.includes(item as string));
        if (invalid.length > 0) {
            throw new Error(
                `Invalid value for "${field}": ${invalid.map(item => JSON.stringify(item)).join(', ')}. ` +
                `Allowed values: ${prop.enum.join(', ')}`
            );
        }
    }
}

const isScalar = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * Turns a tool argument into the value stored for a field, following the type
 * the schema gives it. Fields the schema does not list are stored as they come.
 */
function fieldValue(field: string, prop: SchemaProperty | undefined, value: unknown): FieldValue {
    const isList = Array.isArray(value) && value.every(isScalar);
    if (prop?.type === 'array') {
        if (isList) return (value as unknown[]).map(String);
        if (isScalar(value)) return [String(value)];
        throw new Error(`"${field}" must be a list of text values`);
    }
    if (isScalar(value)) return String(value);
    if (prop) throw new Error(`"${field}" must be a single text value, not a list or an object`);
    return isList ? (value as unknown[]).map(String) : JSON.stringify(value);
}

function notes(value: unknown): string[] {
    const list = requireArray(value, 'metadata');
    if (!list.every(isScalar)) throw new Error('Every item in "metadata" must be text');
    return list.map(String);
}

/** The key of a "key: value" note, lower-cased; null for notes without a colon. */
function noteKey(entry: string): string | null {
    const colon = entry.indexOf(':');
    return colon === -1 ? null : entry.slice(0, colon).trim().toLowerCase();
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

/**
 * Creates a node from a schema tool's arguments:
 *  - the name becomes the node's name,
 *  - relationship fields become edges (and only edges: the edge is the single record of the link),
 *  - every other field is stored in the node's `fields`,
 *  - `metadata`, if given, becomes its free-form notes.
 */
export function addEntity(graph: Graph, schema: EntitySchema, input: unknown): { node: Node; edges: Edge[] } {
    const {entity, properties} = schema;
    const args = requireEntityArgs(input, entity, entity);
    args.name = args.name.trim();
    rejectUnknownFields(schema, args);
    rejectInvalidEnumValues(schema, args);

    const existing = findNode(graph, args.name);
    if (existing) {
        throw new Error(`Node already exists: "${args.name}" (${existing.nodeType}). Update it instead of adding it again.`);
    }
    const missing = Object.keys(properties).filter(field => properties[field].required && !hasValue(args[field]));
    if (missing.length > 0) {
        throw new Error(`Missing required field(s) for ${entity}: ${missing.join(', ')}`);
    }

    const node: Node = {
        type: 'node',
        name: args.name,
        nodeType: entity,
        metadata: isSet(args.metadata) ? notes(args.metadata) : [],
    };
    // Schema fields first (in schema order), then any extra fields.
    const fields = [...Object.keys(properties), ...Object.keys(args).filter(key => !(key in properties))];
    const edges: Edge[] = [];
    for (const field of fields) {
        const value = args[field];
        if (NOT_FIELDS.includes(field) || !hasValue(value)) continue;
        const relationship = properties[field]?.relationship;
        if (relationship) {
            edges.push(...relationshipEdges(graph, args.name, field, relationship.edgeType, value));
        } else {
            setField(node, field, fieldValue(field, properties[field], value));
        }
    }

    graph.nodes.push(node);
    addEdges(graph, edges);
    return {node, edges};
}

/**
 * Changes the fields that are passed and leaves the rest alone. A blank value
 * ("" or []) clears a field; `metadata` replaces the node's free-form notes.
 */
export function updateEntity(
    graph: Graph,
    schema: EntitySchema,
    input: unknown
): { node: Node; removedEdges: Edge[]; addedEdges: Edge[] } {
    const {entity, properties} = schema;
    const args = requireEntityArgs(input, `update_${entity}`, entity);
    rejectUnknownFields(schema, args);
    rejectInvalidEnumValues(schema, args);

    const node = findNode(graph, args.name);
    if (!node || node.nodeType !== entity) {
        const hint = node ? ` ("${args.name}" is a ${node.nodeType})` : '';
        throw new Error(`${entity} "${args.name}" not found${hint}`);
    }

    if (isSet(args.metadata)) node.metadata = notes(args.metadata);
    const removedEdges: Edge[] = [];
    const addedEdges: Edge[] = [];

    for (const [field, value] of Object.entries(args)) {
        if (NOT_FIELDS.includes(field) || !isSet(value)) continue;
        if (isBlank(value) && properties[field]?.required) {
            throw new Error(`"${field}" is required for ${entity} and cannot be cleared`);
        }

        const relationship = properties[field]?.relationship;
        if (relationship) {
            // The field owns every edge of its type leaving this node, so all of them are replaced.
            const newEdges = relationshipEdges(graph, node.name, field, relationship.edgeType, value);
            const old = graph.edges.filter(e => e.from === node.name && e.edgeType === relationship.edgeType);
            graph.edges = graph.edges.filter(e => !old.includes(e));
            removedEdges.push(...old);
            addedEdges.push(...addEdges(graph, newEdges));
        } else {
            setField(node, field, isBlank(value) ? '' : fieldValue(field, properties[field], value));
        }
        // A note such as "status: injured" (how older versions stored fields) would now contradict the field.
        node.metadata = node.metadata.filter(entry => noteKey(entry) !== field.toLowerCase());
    }

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

// ---------------------------------------------------------------------------
// Converting memory written by older versions
// ---------------------------------------------------------------------------

/**
 * Up to v0.6 the schema tools stored everything as "key: value" notes in a node's
 * metadata, e.g. ["name: Mara", "status: injured", "traits: brave, kind", "currentLocation: Town"].
 * This moves those notes to where they belong now:
 *  - "name: <the node's name>" is dropped (the node already has its name),
 *  - a relationship field is dropped when the node has edges of that type (the edges are the record),
 *  - any other field of the node's schema moves into `fields`.
 * Notes that match no schema field, and nodes of a type without a schema, are left alone.
 * Safe to run repeatedly. Returns the number of nodes changed.
 */
export function convertNotesToFields(graph: Graph, schemas: EntitySchema[]): number {
    let changed = 0;
    for (const node of graph.nodes) {
        const schema = schemas.find(s => s.entity === node.nodeType);
        if (!schema) continue;
        const propertyNames = Object.keys(schema.properties);
        const remaining: string[] = [];

        for (const entry of node.metadata) {
            const key = noteKey(entry);
            const value = entry.slice(entry.indexOf(':') + 1).trim();
            const field = key === null ? undefined : propertyNames.find(name => name.toLowerCase() === key);
            const prop = field === undefined ? undefined : schema.properties[field];

            if (key === 'name' && value === node.name) continue;
            if (field === undefined || prop === undefined || field === 'name') {
                remaining.push(entry);
            } else if (prop.relationship) {
                const edgeType = prop.relationship.edgeType;
                const hasEdges = graph.edges.some(e => e.from === node.name && e.edgeType === edgeType);
                if (value !== '' && !hasEdges) remaining.push(entry);
            } else if (node.fields?.[field] !== undefined) {
                remaining.push(entry);
            } else if (value !== '') {
                const list = value.split(', ').map(item => item.trim()).filter(item => item !== '');
                setField(node, field, prop.type === 'array' ? list : value);
            }
        }
        if (remaining.length !== node.metadata.length) {
            node.metadata = remaining;
            changed++;
        }
    }
    return changed;
}
