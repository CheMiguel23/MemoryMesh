// The low-level Server is used (rather than McpServer) because tool input schemas
// are generated at runtime from JSON schema files instead of being written in zod.
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
    type CallToolResult,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {CONFIG} from './config.js';
import * as graph from './graph.js';
import {addEntity, deleteEntity, schemaTools, updateEntity, type EntitySchema} from './schemas.js';
import type {GraphStore} from './store.js';
import {staticTools} from './tools.js';

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<CallToolResult>;

/**
 * A successful result: a one-line summary, followed by the data as JSON.
 * The JSON is not indented: the reader is an AI, and indentation only costs it context space.
 */
export function ok(summary: string, data?: unknown): CallToolResult {
    const text = data === undefined ? summary : `${summary}\n\n${JSON.stringify(data)}`;
    return {content: [{type: 'text', text}]};
}

/** A failed result. The message is shown to the AI so it can correct itself. */
export function fail(message: string): CallToolResult {
    return {content: [{type: 'text', text: `Error: ${message}`}], isError: true};
}

const list = (names: string[]) => names.map(name => `"${name}"`).join(', ');
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function staticHandlers(store: GraphStore): Record<string, Handler> {
    return {
        add_nodes: async ({nodes}) => {
            const added = await store.update(g => graph.addNodes(g, nodes));
            return ok(`Added ${plural(added.length, 'node')}: ${list(added.map(n => n.name))}`, {nodes: added});
        },
        update_nodes: async ({nodes}) => {
            const updated = await store.update(g => graph.updateNodes(g, nodes));
            return ok(`Updated ${plural(updated.length, 'node')}: ${list(updated.map(n => n.name))}`, {nodes: updated});
        },
        delete_nodes: async ({nodeNames}) => {
            const deleted = await store.update(g => graph.deleteNodes(g, nodeNames));
            const missing = (nodeNames as string[]).filter(name => !deleted.includes(name));
            let summary = `Deleted ${plural(deleted.length, 'node')} and their edges`;
            if (deleted.length > 0) summary += `: ${list(deleted)}`;
            if (missing.length > 0) summary += `. Not found: ${list(missing)}`;
            return ok(summary);
        },
        add_edges: async ({edges}) => {
            const added = await store.update(g => graph.addEdges(g, edges));
            return ok(`Added ${plural(added.length, 'edge')}`, {edges: added});
        },
        update_edges: async ({edges}) => {
            const updated = await store.update(g => graph.updateEdges(g, edges));
            return ok(`Updated ${plural(updated.length, 'edge')}`, {edges: updated});
        },
        delete_edges: async ({edges}) => {
            const count = await store.update(g => graph.deleteEdges(g, edges));
            return ok(count === 0 ? 'No matching edges found; nothing deleted' : `Deleted ${plural(count, 'edge')}`);
        },

        read_graph: async () => {
            const g = await store.read();
            const summary = g.nodes.length === 0 && g.edges.length === 0
                ? 'Read complete knowledge graph (graph is empty - no nodes or edges exist yet)'
                : `Read complete knowledge graph (${plural(g.nodes.length, 'node')}, ${plural(g.edges.length, 'edge')})`;
            return ok(summary, g);
        },
        search_nodes: async ({query}) => {
            const result = graph.searchNodes(await store.read(), query);
            const summary = result.nodes.length === 0
                ? `Searched nodes with query: "${query}" - no matching nodes found`
                : `Searched nodes with query: "${query}" - found ${plural(result.nodes.length, 'node')} (matches and their neighbours)`;
            return ok(summary, result);
        },
        find_nodes: async args => {
            const {nodes, edges, total} = graph.findNodes(await store.read(), args);
            let summary = total === 0 ? 'No nodes match' : `Found ${plural(total, 'node')}`;
            if (nodes.length < total) {
                summary += `; showing the first ${nodes.length} (raise "limit" or narrow the conditions to see the rest)`;
            }
            return ok(summary, {nodes, edges});
        },
        open_nodes: async ({names, depth}) => {
            const result = graph.openNodes(await store.read(), names, depth ?? 1);
            const requested = names as string[];
            const found = new Set(result.nodes.map(n => n.name));
            const missing = requested.filter(name => !found.has(name));
            let summary: string;
            if (missing.length === requested.length) summary = `None of the requested nodes were found: ${list(requested)}`;
            else if (missing.length > 0) summary = `Retrieved nodes. Not found: ${list(missing)}`;
            else summary = `Retrieved nodes: ${list(requested)}`;
            return ok(summary, result);
        },

        add_metadata: async ({metadata}) => {
            const results = await store.update(g => graph.addMetadata(g, metadata));
            return ok(`Added metadata to ${plural(results.length, 'node')}`, {metadata: results});
        },
        delete_metadata: async ({deletions}) => {
            const count = await store.update(g => graph.deleteMetadata(g, deletions));
            return ok(`Deleted ${count} metadata ${count === 1 ? 'entry' : 'entries'}`);
        },
    };
}

function schemaHandlers(store: GraphStore, schema: EntitySchema): Record<string, Handler> {
    const {entity} = schema;
    return {
        [`add_${entity}`]: async args => {
            const {node, edges} = await store.update(g => addEntity(g, schema, args[entity]));
            return ok(`Created ${entity}: ${node.name}`, {nodes: [node], edges});
        },
        [`update_${entity}`]: async args => {
            const {node, removedEdges, addedEdges} =
                await store.update(g => updateEntity(g, schema, args[`update_${entity}`]));
            return ok(`Updated ${entity}: ${node.name}`, {
                updatedNode: node,
                edgeChanges: {remove: removedEdges, add: addedEdges},
            });
        },
        [`delete_${entity}`]: async args => {
            const name = await store.update(g => deleteEntity(g, schema, args[`delete_${entity}`]));
            return ok(`Deleted ${entity}: ${name} (and its edges)`);
        },
    };
}

export interface MemoryMeshServer {
    server: Server;
    /**
     * Replaces the schemas, and with them the add_/update_/delete_ tools. When that
     * changes the tool list, connected clients are told to fetch it again.
     * Returns whether the tool list changed.
     */
    setSchemas(schemas: EntitySchema[]): Promise<boolean>;
}

/** Builds the full tool list and handlers, and wires them into an MCP server. */
export function createServer(store: GraphStore, initialSchemas: EntitySchema[]): MemoryMeshServer {
    let tools: Tool[] = [];
    let handlers: Record<string, Handler> = {};

    const use = (schemas: EntitySchema[]): boolean => {
        const before = JSON.stringify(tools);
        tools = [...staticTools, ...schemas.flatMap(schemaTools)];
        handlers = Object.assign(staticHandlers(store), ...schemas.map(schema => schemaHandlers(store, schema)));
        return JSON.stringify(tools) !== before;
    };
    use(initialSchemas);

    const server = new Server(
        {name: CONFIG.name, version: CONFIG.version},
        {capabilities: {tools: {listChanged: true}}}
    );

    const setSchemas = async (schemas: EntitySchema[]): Promise<boolean> => {
        const changed = use(schemas);
        if (changed && server.transport) {
            // A client that has gone away, or does not listen, must not break the reload.
            await server.sendToolListChanged().catch(() => undefined);
        }
        return changed;
    };

    server.setRequestHandler(ListToolsRequestSchema, async () => ({tools}));

    server.setRequestHandler(CallToolRequestSchema, async request => {
        const {name, arguments: args = {}} = request.params;
        // Own properties only: "constructor", "toString" etc. are not tools.
        const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
        if (!handler) {
            throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
        }
        try {
            return await handler(args);
        } catch (error) {
            return fail(error instanceof Error ? error.message : String(error));
        }
    });

    return {server, setSchemas};
}
