import {mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {beforeEach, describe, expect, it} from 'vitest';
import {addNodes, updateNodes} from '../src/graph.js';
import {GraphStore} from '../src/store.js';

let dir: string;
let file: string;

beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'memorymesh-store-'));
    file = path.join(dir, 'nested', 'memory.json');
});

describe('GraphStore', () => {
    it('treats a missing file as an empty graph and creates it on first write', async () => {
        const store = new GraphStore(file);
        expect(await store.read()).toEqual({nodes: [], edges: []});
        await store.update(g => addNodes(g, [{name: 'A', nodeType: 't'}]));
        expect(readFileSync(file, 'utf-8')).toBe('{"type":"node","name":"A","nodeType":"t","metadata":[]}\n');
    });

    it('reads the existing JSON Lines format, ignoring blank lines and unknown records', async () => {
        writeFileSync(path.join(dir, 'm.json'), [
            '{"type":"node","name":"A","nodeType":"t","metadata":[]}',
            '',
            '{"type":"something-else"}',
            '{"name":"B","nodeType":"t","metadata":[],"type":"node"}',
            '{"type":"edge","from":"A","to":"B","edgeType":"knows"}',
        ].join('\n'));
        const g = await new GraphStore(path.join(dir, 'm.json')).read();
        expect(g.nodes.map(n => n.name)).toEqual(['A', 'B']);
        expect(g.edges).toHaveLength(1);
    });

    it('writes nothing when the change throws', async () => {
        const store = new GraphStore(file);
        await store.update(g => addNodes(g, [{name: 'A', nodeType: 't', metadata: ['keep']}]));
        const before = readFileSync(file, 'utf-8');

        // The first update succeeds in memory, the second fails: neither may be saved.
        await expect(store.update(g => updateNodes(g, [
            {name: 'A', metadata: ['changed']},
            {name: 'Missing'},
        ]))).rejects.toThrow('Node not found');

        expect(readFileSync(file, 'utf-8')).toBe(before);
    });

    it('does not lose updates when calls overlap', async () => {
        const store = new GraphStore(file);
        await Promise.all(Array.from({length: 25}, (_, i) =>
            store.update(g => addNodes(g, [{name: `N${i}`, nodeType: 't'}]))
        ));
        expect((await store.read()).nodes).toHaveLength(25);
    });

    it('keeps working after a failed call', async () => {
        const store = new GraphStore(file);
        await expect(store.update(() => {
            throw new Error('boom');
        })).rejects.toThrow('boom');
        await store.update(g => addNodes(g, [{name: 'A', nodeType: 't'}]));
        expect((await store.read()).nodes).toHaveLength(1);
    });

    it('refuses to load a corrupt file instead of silently dropping data', async () => {
        writeFileSync(path.join(dir, 'm.json'), '{"type":"node","name":"A","nodeType":"t","metadata":[]}\n{oops\n');
        const store = new GraphStore(path.join(dir, 'm.json'));
        await expect(store.read()).rejects.toThrow('line 2');
        await expect(store.update(() => undefined)).rejects.toThrow('line 2');
        expect(readFileSync(path.join(dir, 'm.json'), 'utf-8')).toContain('{oops');
    });

    it('leaves no temporary files behind', async () => {
        const store = new GraphStore(file);
        await store.update(g => addNodes(g, [{name: 'A', nodeType: 't'}]));
        expect(readdirSync(path.dirname(file))).toEqual(['memory.json']);
    });
});
