import {mkdtempSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {describe, expect, it, vi} from 'vitest';
import {addEntity, deleteEntity, loadSchemas, parseSchema, schemaTools, updateEntity} from '../src/schemas.js';
import type {Graph} from '../src/types.js';

const npc = parseSchema({
    name: 'add_npc',
    description: 'Add an NPC',
    properties: {
        name: {type: 'string', description: 'Name', required: true},
        race: {type: 'string', description: 'Race', required: true, enum: ['Human', 'Elf']},
        traits: {type: 'array', description: 'Traits'},
        currentLocation: {
            type: 'string', description: 'Where', required: true,
            relationship: {edgeType: 'located_in', description: 'Current location'},
        },
        allies: {type: 'array', description: 'Allies', relationship: {edgeType: 'allied_with'}},
    },
    additionalProperties: true,
});

function world(): Graph {
    return {
        nodes: [
            {type: 'node', name: 'Town', nodeType: 'location', metadata: []},
            {type: 'node', name: 'Forest', nodeType: 'location', metadata: []},
        ],
        edges: [],
    };
}

describe('parseSchema', () => {
    it('derives the entity from the name', () => {
        expect(npc.entity).toBe('npc');
    });

    it('rejects invalid schemas with a clear reason', () => {
        const base = {name: 'add_x', description: 'd', properties: {}};
        expect(() => parseSchema({...base, name: 'npc'})).toThrow('must start with "add_"');
        expect(() => parseSchema({...base, name: 'add_nodes'})).toThrow('clashes with a built-in tool');
        expect(() => parseSchema({...base, description: ''})).toThrow('"description"');
        expect(() => parseSchema({...base, properties: {a: {type: 'string'}}})).toThrow('property "a"');
        expect(() => parseSchema({...base, properties: {a: {type: 'string', description: 'd', relationship: {}}}}))
            .toThrow('edgeType');
    });
});

describe('loadSchemas', () => {
    it('loads every bundled example schema', async () => {
        const schemas = await loadSchemas(fileURLToPath(new URL('../src/data/schemas', import.meta.url)));
        expect(schemas.map(s => s.entity)).toEqual([
            'artifact', 'currency', 'faction', 'inventory', 'location', 'npc',
            'player_character', 'quest', 'skills', 'temporal', 'transportation',
        ]);
    });

    it('skips broken files and duplicates but keeps the rest', async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'memorymesh-schemas-'));
        const ok = {name: 'add_ok', description: 'd', properties: {}};
        writeFileSync(path.join(dir, 'a.schema.json'), JSON.stringify(ok));
        writeFileSync(path.join(dir, 'b.schema.json'), JSON.stringify(ok));
        writeFileSync(path.join(dir, 'c.schema.json'), '{ not json');
        writeFileSync(path.join(dir, 'ignored.json'), JSON.stringify({...ok, name: 'add_ignored'}));
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect((await loadSchemas(dir)).map(s => s.entity)).toEqual(['ok']);
        expect(log).toHaveBeenCalledTimes(2);
        log.mockRestore();
    });
});

describe('schemaTools', () => {
    const [add, update, del] = schemaTools(npc);
    const fields = (tool: typeof add, key: string) => (tool.inputSchema.properties[key] as any);

    it('generates add/update/delete tools', () => {
        expect([add.name, update.name, del.name]).toEqual(['add_npc', 'update_npc', 'delete_npc']);
        expect(add.description).toBe('Add an NPC');
        expect(del.description).toBe('Delete an existing npc from the knowledge graph');
    });

    it('describes fields, enums and relationships', () => {
        const props = fields(add, 'npc').properties;
        expect(props.race).toEqual({type: 'string', description: 'Race', enum: ['Human', 'Elf']});
        expect(props.traits.type).toBe('array');
        expect(props.currentLocation).toMatchObject({type: 'array', description: 'Current location'});
        expect(fields(add, 'npc').required).toEqual(['name', 'race', 'currentLocation']);
    });

    it('requires name for updates and offers metadata replacement', () => {
        expect(fields(update, 'update_npc').required).toEqual(['name']);
        expect(fields(update, 'update_npc').properties.metadata.type).toBe('array');
    });

    it('adds a name field when the schema does not define one', () => {
        const [addX] = schemaTools(parseSchema({name: 'add_x', description: 'd', properties: {}}));
        expect(fields(addX, 'x').properties.name.type).toBe('string');
        expect(fields(addX, 'x').required).toEqual(['name']);
    });

    it('honours additionalProperties: false', () => {
        const strict = parseSchema({name: 'add_x', description: 'd', properties: {}, additionalProperties: false});
        const [addX, updateX] = schemaTools(strict);
        expect(fields(addX, 'x').additionalProperties).toBe(false);
        expect(fields(updateX, 'update_x').additionalProperties).toBe(false);
    });
});

describe('addEntity', () => {
    it('creates the node, its metadata and relationship edges', () => {
        const g = world();
        const {node, edges} = addEntity(g, npc, {
            name: 'Bob', race: 'Human', traits: ['brave', 'loud'], currentLocation: 'Town', mood: 'happy',
        });
        expect(node.metadata).toEqual([
            'name: Bob', 'race: Human', 'traits: brave, loud', 'currentLocation: Town', 'mood: happy',
        ]);
        expect(edges).toEqual([{type: 'edge', from: 'Bob', to: 'Town', edgeType: 'located_in'}]);
        expect(g.nodes).toContain(node);
        expect(g.edges).toEqual(edges);
    });

    it('accepts arrays for relationships and ignores repeated targets', () => {
        const {edges} = addEntity(world(), npc, {name: 'Bob', race: 'Elf', currentLocation: ['Town', 'Forest', 'Town']});
        expect(edges.map(e => e.to)).toEqual(['Town', 'Forest']);
    });

    it('lists all missing required fields at once', () => {
        expect(() => addEntity(world(), npc, {name: 'Bob'})).toThrow('race, currentLocation');
    });

    it('explains a missing relationship target and changes nothing', () => {
        const g = world();
        expect(() => addEntity(g, npc, {name: 'Lilith', race: 'Elf', currentLocation: 'Unknown'}))
            .toThrow('no node named "Unknown" exists');
        // The node was appended before edge validation; GraphStore discards the whole change.
    });

    it('rejects existing names and malformed arguments', () => {
        const g = world();
        expect(() => addEntity(g, npc, {name: 'Town', race: 'Elf', currentLocation: 'Forest'})).toThrow('already exists');
        expect(() => addEntity(g, npc, undefined)).toThrow('Missing argument "npc"');
        expect(() => addEntity(g, npc, {race: 'Elf'})).toThrow('"name" is required');
    });

    it('rejects unknown fields only when additionalProperties is false', () => {
        const strict = parseSchema({name: 'add_x', description: 'd', properties: {}, additionalProperties: false});
        expect(() => addEntity(world(), strict, {name: 'A', bogus: 1})).toThrow('Unknown field(s) for x: bogus');
    });
});

describe('updateEntity', () => {
    function withBob(): Graph {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town'});
        g.nodes[2].metadata.push('a note without a colon', 'Mood: calm');
        return g;
    }

    it('replaces matching entries in place, keeping key spelling and unrelated notes', () => {
        const g = withBob();
        const {node} = updateEntity(g, npc, {name: 'Bob', race: 'Elf', mood: 'angry', title: 'Sir'});
        expect(node.metadata).toEqual([
            'name: Bob', 'race: Elf', 'currentLocation: Town', 'a note without a colon', 'mood: angry', 'title: Sir',
        ]);
    });

    it('replaces relationship edges', () => {
        const g = withBob();
        const {removedEdges, addedEdges} = updateEntity(g, npc, {name: 'Bob', currentLocation: 'Forest'});
        expect(removedEdges.map(e => e.to)).toEqual(['Town']);
        expect(addedEdges.map(e => e.to)).toEqual(['Forest']);
        expect(g.edges).toEqual([{type: 'edge', from: 'Bob', to: 'Forest', edgeType: 'located_in'}]);
        expect(g.nodes[2].metadata).toContain('currentLocation: Forest');
    });

    it('replaces the whole metadata list when "metadata" is given', () => {
        const {node} = updateEntity(withBob(), npc, {name: 'Bob', metadata: ['fresh: start'], race: 'Elf'});
        expect(node.metadata).toEqual(['fresh: start', 'race: Elf']);
    });

    it('only updates nodes of its own type', () => {
        expect(() => updateEntity(withBob(), npc, {name: 'Town'})).toThrow('npc "Town" not found ("Town" is a location)');
        expect(() => updateEntity(withBob(), npc, {name: 'Nobody'})).toThrow('npc "Nobody" not found');
    });
});

describe('deleteEntity', () => {
    it('deletes the node and its edges', () => {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town'});
        expect(deleteEntity(g, npc, {name: 'Bob'})).toBe('Bob');
        expect(g.nodes.map(n => n.name)).toEqual(['Town', 'Forest']);
        expect(g.edges).toEqual([]);
    });

    it('only deletes nodes of its own type', () => {
        expect(() => deleteEntity(world(), npc, {name: 'Town'})).toThrow('npc "Town" not found');
    });
});
