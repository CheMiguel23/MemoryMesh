/**
 * End-to-end tests: a real MCP client talks to the server over an in-memory
 * transport, using the bundled example schemas and a temporary memory file.
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ToolListChangedNotificationSchema, type CallToolResult, type Tool} from '@modelcontextprotocol/sdk/types.js';
import {existsSync, mkdtempSync, readFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {loadSchemas} from '../src/schemas.js';
import {createServer, type MemoryMeshServer} from '../src/server.js';
import {GraphStore} from '../src/store.js';

const schemasDir = fileURLToPath(new URL('../src/data/schemas', import.meta.url));

let client: Client;
let memoryFile: string;
let server: MemoryMeshServer['server'];
let setSchemas: MemoryMeshServer['setSchemas'];

beforeEach(async () => {
    memoryFile = path.join(mkdtempSync(path.join(tmpdir(), 'memorymesh-e2e-')), 'memory.json');
    ({server, setSchemas} = createServer(new GraphStore(memoryFile), await loadSchemas(schemasDir)));
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

    it('lists the 12 built-in tools plus add and update for each of the 2 example schemas', () => {
        expect(tools).toHaveLength(16);
        const names = tools.map(t => t.name);
        for (const name of ['add_nodes', 'update_nodes', 'delete_nodes', 'add_edges', 'update_edges', 'delete_edges',
            'read_graph', 'search_nodes', 'open_nodes', 'find_nodes', 'add_metadata', 'delete_metadata',
            'add_npc', 'update_npc', 'add_location', 'update_location']) {
            expect(names).toContain(name);
        }
        // Nodes of every type are deleted with delete_nodes; there is no delete tool per schema.
        expect(names.filter(name => name.startsWith('delete_'))).toEqual(['delete_nodes', 'delete_edges', 'delete_metadata']);
        expect(new Set(names).size).toBe(names.length);
    });

    it('tells clients which tools only read, which only add, and which change existing data', () => {
        const hints = (name: string) => tools.find(t => t.name === name)!.annotations;
        for (const tool of tools) {
            expect(tool.annotations, tool.name).toBeDefined();
            expect(tool.annotations!.openWorldHint, tool.name).toBe(false);
        }
        for (const name of ['read_graph', 'search_nodes', 'open_nodes', 'find_nodes']) {
            expect(hints(name)!.readOnlyHint, name).toBe(true);
        }
        for (const name of ['add_nodes', 'add_edges', 'add_metadata', 'add_npc', 'add_location']) {
            expect(hints(name), name).toMatchObject({readOnlyHint: false, destructiveHint: false});
        }
        for (const name of ['update_nodes', 'update_edges', 'delete_nodes', 'delete_edges', 'delete_metadata',
            'update_npc', 'update_location']) {
            expect(hints(name), name).toMatchObject({readOnlyHint: false, destructiveHint: true});
        }
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
        ]})).text).toContain('"weight":0.8');
        expect((await call('add_metadata', {metadata: [{nodeName: 'Frodo', contents: ['bearer: yes']}]})).isError).toBe(false);

        const search = await call('search_nodes', {query: 'hobbit'});
        expect(search.text).toContain('found 2 nodes');

        const open = await call('open_nodes', {names: ['Frodo', 'Sauron']});
        expect(open.text).toContain('Not found: "Sauron"');
        expect(open.text).toContain('bearer: yes');

        expect((await call('delete_metadata', {deletions: [{nodeName: 'Frodo', metadata: ['bearer: yes']}]})).text)
            .toBe('Deleted 1 metadata entry');
        expect((await call('update_nodes', {nodes: [{name: 'Frodo', nodeType: 'hero'}]})).text).toContain('"nodeType":"hero"');
        expect((await call('delete_edges', {edges: [{from: 'Frodo', to: 'Shire', edgeType: 'lives_in'}]})).text)
            .toBe('Deleted 1 edge');
        expect((await call('delete_nodes', {nodeNames: ['Shire', 'Mordor']})).text)
            .toBe('Deleted 1 node and their edges: "Shire". Not found: "Mordor"');

        expect((await call('read_graph')).text).toContain('(1 node, 0 edges)');
    });

    it('update_nodes renames a node, and its edges follow', async () => {
        await seedTown();
        await call('add_npc', {npc: {name: 'Bob', description: 'A man', currentLocation: ['Town']}});
        const r = await call('update_nodes', {nodes: [{name: 'Town', newName: 'Riverton'}]});
        expect(r.text).toContain('Updated 1 node: "Riverton"');

        const lines = memory().trimEnd().split('\n').map(line => JSON.parse(line));
        expect(lines.find(l => l.nodeType === 'location').name).toBe('Riverton');
        expect(lines.find(l => l.type === 'edge')).toMatchObject({from: 'Bob', to: 'Riverton'});
        // Nothing keeps a copy of the old name, so nothing is left to go stale.
        expect(memory()).not.toContain('Town');
    });

    it('add_nodes and update_nodes work with fields', async () => {
        await call('add_nodes', {nodes: [{name: 'Ring', nodeType: 'item', fields: {owner: 'Frodo', powers: ['invisibility']}}]});
        const r = await call('update_nodes', {nodes: [{name: 'Ring', fields: {owner: 'Gollum', powers: [], age: 'ancient'}}]});
        expect(r.text).toContain('"fields":{"owner":"Gollum","age":"ancient"}');
        expect((await call('search_nodes', {query: 'owner: gollum'})).text).toContain('found 1 node');
        expect((await call('add_nodes', {nodes: [{name: 'X', nodeType: 't', fields: {n: {a: 1}}}]})).text)
            .toBe('Error: nodes[0].fields.n must be a string, a number, true/false, or an array of strings');
    });

    it('returns data as compact JSON after a one-line summary', async () => {
        await call('add_nodes', {nodes: [{name: 'Frodo', nodeType: 'npc', metadata: ['race: Hobbit']}]});
        expect((await call('read_graph')).text).toBe(
            'Read complete knowledge graph (1 node, 0 edges)\n\n' +
            '{"nodes":[{"type":"node","name":"Frodo","nodeType":"npc","metadata":["race: Hobbit"]}],"edges":[]}'
        );
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

    it('does not mistake built-in object properties for tools', async () => {
        for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
            await expect(client.callTool({name, arguments: {}})).rejects.toThrow('Unknown tool');
        }
    });
});

describe('changing schemas while running', () => {
    it('swaps the schema tools and tells the client the tool list changed', async () => {
        let notifications = 0;
        client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
            notifications++;
        });
        const toolNames = async () => (await client.listTools()).tools.map(t => t.name);
        const [location, npc] = await loadSchemas(schemasDir);
        expect(client.getServerCapabilities()?.tools?.listChanged).toBe(true);

        // Remove the npc schema.
        expect(await setSchemas([location])).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(notifications).toBe(1);
        expect(await toolNames()).not.toContain('add_npc');
        expect(await toolNames()).toContain('add_location');
        await expect(client.callTool({name: 'add_npc', arguments: {npc: {name: 'Bob'}}})).rejects.toThrow('Unknown tool');

        // Nothing changed: no notification.
        expect(await setSchemas([location])).toBe(false);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(notifications).toBe(1);

        // Put it back, with a new field.
        const richer = {...npc, properties: {...npc.properties, age: {type: 'number', description: 'Age'}}};
        expect(await setSchemas([location, richer])).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(notifications).toBe(2);
        await seedTown();
        const r = await call('add_npc', {npc: {name: 'Bob', description: 'd', age: 40}});
        expect(r.text).toContain('"age":40');
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

    it('add and update an npc with relationship edges, then delete it', async () => {
        await seedTown();
        await call('add_location', {location: {name: 'Forest', type: 'Wild', description: 'd'}});

        const add = await call('add_npc', {npc: {
            name: 'Bob', role: 'Smith', status: 'alive', description: 'd', currentLocation: 'Town', mood: 'fine',
            traits: ['gruff'],
        }});
        expect(add.text).toContain('Created npc: Bob');
        expect(memory()).toContain('"from":"Bob","to":"Town","edgeType":"located_in"');

        await call('add_metadata', {metadata: [{nodeName: 'Bob', contents: ['a note']}]});
        const update = await call('update_npc', {update_npc: {name: 'Bob', status: 'dead', currentLocation: 'Forest'}});
        expect(update.isError).toBe(false);

        expect(memory().split('\n').find(line => line.includes('"name":"Bob"'))).toBe(
            '{"type":"node","name":"Bob","nodeType":"npc",' +
            '"fields":{"description":"d","role":"Smith","status":"dead","traits":["gruff"],"mood":"fine"},' +
            '"metadata":["a note"]}'
        );
        expect(memory()).toContain('"from":"Bob","to":"Forest"');
        expect(memory()).not.toContain('"from":"Bob","to":"Town"');

        expect((await call('delete_nodes', {nodeNames: ['Bob']})).text).toBe('Deleted 1 node and their edges: "Bob"');
        expect(memory()).not.toContain('Bob');
        await expect(client.callTool({name: 'delete_npc', arguments: {delete_npc: {name: 'Bob'}}})).rejects.toThrow('Unknown tool');
    });

    it('rejects a value outside a field\'s enum, and saves nothing', async () => {
        const r = await call('add_npc', {npc: {name: 'Bob', description: 'A man', status: 'sleepy'}});
        expect(r).toEqual({
            isError: true,
            text: 'Error: Invalid value for "status": "sleepy". Allowed values: alive, injured, dead, missing',
        });
        expect(memory()).toBe('');
    });

    it('search_nodes finds a node by several words at once', async () => {
        await seedTown();
        await call('add_npc', {npc: {name: 'Bob', description: 'A grumpy blacksmith', currentLocation: ['Town']}});
        const r = await call('search_nodes', {query: 'blacksmith town'});
        expect(r.text).toContain('found 2 nodes');
        expect(r.text).toContain('"name":"Bob"');
    });

    it('find_nodes answers exact questions about fields and links', async () => {
        await seedTown();
        await call('add_location', {location: {name: 'Forest', description: 'd'}});
        await call('add_npc', {npc: {name: 'Bob', description: 'd', status: 'injured', currentLocation: 'Town'}});
        await call('add_npc', {npc: {name: 'Ann', description: 'd', status: 'alive', currentLocation: 'Town'}});
        await call('add_npc', {npc: {name: 'Cat', description: 'd', status: 'injured', currentLocation: 'Forest'}});

        const injuredInTown = await call('find_nodes', {
            nodeType: 'npc', where: {status: 'injured'}, linkedTo: 'Town', edgeType: 'located_in',
        });
        expect(injuredInTown.text).toBe(
            'Found 1 node\n\n' +
            '{"nodes":[{"type":"node","name":"Bob","nodeType":"npc","fields":{"description":"d","status":"injured"},"metadata":[]}],' +
            '"edges":[{"type":"edge","from":"Bob","to":"Town","edgeType":"located_in"}]}'
        );
        expect((await call('find_nodes', {nodeType: 'npc', limit: 2})).text)
            .toContain('Found 3 nodes; showing the first 2');
        expect((await call('find_nodes', {where: {status: 'dead'}})).text).toContain('No nodes match');
        expect((await call('find_nodes', {})).text).toContain('Error: Give at least one of');
        expect((await call('find_nodes')).text).toContain('Error: Give at least one of');
    });

    it('open_nodes follows more links when asked to', async () => {
        await seedTown();
        await call('add_location', {location: {name: 'Mill', description: 'd', partOf: 'Town'}});
        await call('add_npc', {npc: {name: 'Bob', description: 'd', currentLocation: 'Mill'}});
        const names = async (depth?: number) =>
            JSON.parse((await call('open_nodes', {names: ['Bob'], depth})).text.split('\n\n')[1]).nodes.map((n: any) => n.name);
        expect(await names(0)).toEqual(['Bob']);
        expect(await names()).toEqual(['Bob', 'Mill']);
        expect(await names(2)).toEqual(['Bob', 'Town', 'Mill']);
        expect((await call('open_nodes', {names: ['Bob'], depth: 9})).text).toBe('Error: "depth" must be a whole number from 0 to 3');
    });

    it('update_npc can replace the notes without touching the fields', async () => {
        await seedTown();
        await call('add_npc', {npc: {name: 'Bob', description: 'd', currentLocation: 'Town', metadata: ['first note']}});
        await call('update_npc', {update_npc: {name: 'Bob', metadata: ['fresh start']}});
        expect(memory()).toContain('"fields":{"description":"d"},"metadata":["fresh start"]');
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
    });
});
