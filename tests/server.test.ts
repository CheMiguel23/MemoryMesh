/**
 * End-to-end tests: a real MCP client talks to the server over an in-memory
 * transport, using the bundled example schemas and a temporary memory file.
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import type {CallToolResult, Tool} from '@modelcontextprotocol/sdk/types.js';
import {existsSync, mkdtempSync, readFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {loadSchemas} from '../src/schemas.js';
import {createServer} from '../src/server.js';
import {GraphStore} from '../src/store.js';

const schemasDir = fileURLToPath(new URL('../src/data/schemas', import.meta.url));

let client: Client;
let memoryFile: string;

beforeEach(async () => {
    memoryFile = path.join(mkdtempSync(path.join(tmpdir(), 'memorymesh-e2e-')), 'memory.json');
    const server = createServer(new GraphStore(memoryFile), await loadSchemas(schemasDir));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    client = new Client({name: 'test', version: '1.0.0'});
    await client.connect(clientSide);
});

afterEach(async () => {
    await client.close();
});

async function call(name: string, args?: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const result = await client.callTool({name, arguments: args}) as CallToolResult;
    expect(result.content).toHaveLength(1);
    const [block] = result.content;
    expect(block.type).toBe('text');
    return {text: (block as { text: string }).text, isError: result.isError === true};
}

const memory = () => existsSync(memoryFile) ? readFileSync(memoryFile, 'utf-8') : '';

async function seedTown() {
    const r = await call('add_location', {location: {name: 'Town', type: 'City', description: 'A town'}});
    expect(r.isError).toBe(false);
}

describe('tools/list', () => {
    let tools: Tool[];
    beforeEach(async () => {
        tools = (await client.listTools()).tools;
    });

    it('lists the 11 built-in tools plus add/update/delete for each of the 2 example schemas', () => {
        expect(tools).toHaveLength(17);
        const names = tools.map(t => t.name);
        for (const name of ['add_nodes', 'update_nodes', 'delete_nodes', 'add_edges', 'update_edges', 'delete_edges',
            'read_graph', 'search_nodes', 'open_nodes', 'add_metadata', 'delete_metadata',
            'add_npc', 'update_npc', 'delete_npc', 'add_location', 'update_location', 'delete_location']) {
            expect(names).toContain(name);
        }
        expect(new Set(names).size).toBe(names.length);
    });

    it('every tool definition follows the MCP spec', () => {
        const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
        const checkProperty = (prop: any, where: string) => {
            expect(validTypes, where).toContain(prop.type);
            if (prop.type === 'array') expect(prop.items, `${where}.items`).toBeDefined();
            if (prop.type === 'object') checkObject(prop, where);
        };
        const checkObject = (schema: any, where: string) => {
            expect(typeof schema.properties, where).toBe('object');
            for (const field of schema.required ?? []) {
                expect(schema.properties, `${where} requires "${field}"`).toHaveProperty(field);
            }
            for (const [key, prop] of Object.entries(schema.properties)) checkProperty(prop, `${where}.${key}`);
        };

        for (const tool of tools) {
            expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
            expect(tool.description, tool.name).toBeTruthy();
            expect(tool.description).not.toMatch(/\n/);
            expect(tool.inputSchema.type).toBe('object');
            checkObject(tool.inputSchema, tool.name);
        }
    });
});

describe('static tools', () => {
    it('read_graph works without arguments (many clients send none)', async () => {
        const r = await call('read_graph');
        expect(r.isError).toBe(false);
        expect(r.text).toContain('graph is empty');
    });

    it('full round trip: nodes, edges, metadata, search, open, delete', async () => {
        expect((await call('add_nodes', {nodes: [
            {name: 'Frodo', nodeType: 'npc', metadata: ['race: Hobbit']},
            {name: 'Shire', nodeType: 'location', metadata: []},
        ]})).text).toContain('Added 2 nodes: "Frodo", "Shire"');

        expect((await call('add_edges', {edges: [{from: 'Frodo', to: 'Shire', edgeType: 'lives_in'}]})).isError).toBe(false);
        expect((await call('update_edges', {edges: [
            {from: 'Frodo', to: 'Shire', edgeType: 'lives_in', newWeight: 0.8},
        ]})).text).toContain('"weight": 0.8');
        expect((await call('add_metadata', {metadata: [{nodeName: 'Frodo', contents: ['bearer: yes']}]})).isError).toBe(false);

        const search = await call('search_nodes', {query: 'hobbit'});
        expect(search.text).toContain('found 2 nodes');

        const open = await call('open_nodes', {names: ['Frodo', 'Sauron']});
        expect(open.text).toContain('Not found: "Sauron"');
        expect(open.text).toContain('bearer: yes');

        expect((await call('delete_metadata', {deletions: [{nodeName: 'Frodo', metadata: ['bearer: yes']}]})).text)
            .toBe('Deleted 1 metadata entry');
        expect((await call('update_nodes', {nodes: [{name: 'Frodo', nodeType: 'hero'}]})).text).toContain('"nodeType": "hero"');
        expect((await call('delete_edges', {edges: [{from: 'Frodo', to: 'Shire', edgeType: 'lives_in'}]})).text)
            .toBe('Deleted 1 edge');
        expect((await call('delete_nodes', {nodeNames: ['Shire', 'Mordor']})).text)
            .toBe('Deleted 1 node and their edges: "Shire". Not found: "Mordor"');

        expect((await call('read_graph')).text).toContain('(1 node, 0 edges)');
    });

    it('delete results are not empty, so the AI can see what happened', async () => {
        const r = await call('delete_edges', {edges: [{from: 'A', to: 'B', edgeType: 'x'}]});
        expect(r.text).toBe('No matching edges found; nothing deleted');
    });

    it('reports bad input as a tool error the AI can read', async () => {
        const r = await call('add_nodes', {nodes: 'Frodo'});
        expect(r).toEqual({isError: true, text: 'Error: "nodes" must be an array'});
    });

    it('rejects unknown tools with a protocol error', async () => {
        await expect(client.callTool({name: 'no_such_tool', arguments: {}})).rejects.toThrow('Unknown tool');
    });
});

describe('schema tools', () => {
    it('a failed add_npc saves nothing (regression: issue #35)', async () => {
        const r = await call('add_npc', {npc: {
            name: 'Lilith', description: 'd', currentLocation: ['Unknown'],
        }});
        expect(r.isError).toBe(true);
        expect(r.text).toContain('no node named "Unknown" exists');
        expect(memory()).toBe('');
    });

    it('add, update and delete an npc with relationship edges', async () => {
        await seedTown();
        await call('add_location', {location: {name: 'Forest', type: 'Wild', description: 'd'}});

        const add = await call('add_npc', {npc: {
            name: 'Bob', role: 'Smith', status: 'alive', description: 'd', currentLocation: 'Town', mood: 'fine',
        }});
        expect(add.text).toContain('Created npc: Bob');
        expect(memory()).toContain('"from":"Bob","to":"Town","edgeType":"located_in"');

        await call('add_metadata', {metadata: [{nodeName: 'Bob', contents: ['a note without a colon']}]});
        const update = await call('update_npc', {update_npc: {name: 'Bob', status: 'dead', currentLocation: 'Forest'}});
        expect(update.isError).toBe(false);

        const bob = JSON.parse(memory().split('\n').find(line => line.includes('"name":"Bob"'))!);
        expect(bob.metadata).toEqual([
            'name: Bob', 'description: d', 'role: Smith', 'status: dead', 'currentLocation: Forest', 'mood: fine',
            'a note without a colon',
        ]);
        expect(memory()).toContain('"from":"Bob","to":"Forest"');
        expect(memory()).not.toContain('"from":"Bob","to":"Town"');

        expect((await call('delete_npc', {delete_npc: {name: 'Bob'}})).text).toBe('Deleted npc: Bob (and its edges)');
        expect(memory()).not.toContain('Bob');
    });

    it('update_npc can replace all metadata', async () => {
        await seedTown();
        await call('add_npc', {npc: {name: 'Bob', description: 'd', currentLocation: 'Town'}});
        await call('update_npc', {update_npc: {name: 'Bob', metadata: ['fresh: start']}});
        expect(memory()).toContain('"metadata":["fresh: start"]');
    });

    it('a location can be part of another location', async () => {
        await seedTown();
        const r = await call('add_location', {location: {name: 'Tavern', description: 'Noisy', partOf: 'Town'}});
        expect(r.isError).toBe(false);
        expect(memory()).toContain('"from":"Tavern","to":"Town","edgeType":"part_of"');
    });

    it('explains missing arguments', async () => {
        expect((await call('add_npc', {})).text).toContain('Missing argument "npc"');
        expect((await call('add_npc', {npc: {name: 'Bob'}})).text)
            .toContain('Missing required field(s) for npc: description');
        expect((await call('delete_npc', {delete_npc: {name: 'Nobody'}})).text).toBe('Error: npc "Nobody" not found');
    });
});
