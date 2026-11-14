import {mkdtempSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {describe, expect, it, vi} from 'vitest';
import {
    addEntity, convertNotesToFields, loadSchemas, parseSchema, schemaTools, schemaWarnings, updateEntity,
} from '../src/schemas.js';
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

    it('rejects anything that would produce a malformed tool definition', () => {
        const base = {name: 'add_x', description: 'd', properties: {}};
        const withProp = (prop: unknown) => ({...base, properties: {a: prop}});
        expect(() => parseSchema([])).toThrow('must be a JSON object');
        expect(() => parseSchema({...base, properties: []})).toThrow('"properties" must be an object');
        expect(() => parseSchema({...base, name: 'add_' + 'x'.repeat(58)})).toThrow('too long');
        expect(() => parseSchema(withProp('string'))).toThrow('property "a"');
        expect(() => parseSchema(withProp({type: 'string', description: 'd', enum: 'a, b'}))).toThrow('"enum"');
        expect(() => parseSchema(withProp({type: 'string', description: 'd', enum: []}))).toThrow('"enum"');
        expect(() => parseSchema(withProp({type: 'string', description: 'd', enum: ['a', 1]}))).toThrow('"enum"');
        expect(() => parseSchema(withProp({type: 'string', description: 'd', relationship: 'located_in'})))
            .toThrow('edgeType');
        expect(parseSchema({...base, name: 'add_' + 'x'.repeat(57)}).entity).toHaveLength(57);
    });
});

describe('schemaWarnings', () => {
    it('finds nothing wrong with a normal schema', () => {
        expect(schemaWarnings(npc)).toEqual([]);
    });

    it('points out settings that will not behave as expected', () => {
        const warnings = schemaWarnings(parseSchema({
            name: 'add_x',
            description: 'd',
            properties: {
                age: {type: 'integer', description: 'Age'},
                metadata: {type: 'array', description: 'Notes'},
                home: {type: 'string', description: 'Home', relationship: {edgeType: 'located_in'}},
                work: {type: 'string', description: 'Work', relationship: {edgeType: 'located_in'}},
            },
        }));
        expect(warnings).toHaveLength(3);
        expect(warnings[0]).toContain('type "integer"');
        expect(warnings[1]).toContain('"metadata" clashes');
        expect(warnings[2]).toContain('"home" and "work" share the edgeType "located_in"');
    });
});

describe('loadSchemas', () => {
    it('loads every bundled example schema', async () => {
        const schemas = await loadSchemas(fileURLToPath(new URL('../src/data/schemas', import.meta.url)));
        expect(schemas.map(s => s.entity)).toEqual(['location', 'npc']);
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
    const [add, update] = schemaTools(npc);
    const fields = (tool: typeof add, key: string) => (tool.inputSchema.properties[key] as any);

    it('generates an add and an update tool (deleting is done with delete_nodes)', () => {
        expect(schemaTools(npc).map(tool => tool.name)).toEqual(['add_npc', 'update_npc']);
        expect(add.description).toBe('Add an NPC');
        expect(update.description).toContain('Update an existing npc');
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
    it('stores fields as fields, relationships as edges, and notes as metadata', () => {
        const g = world();
        const {node, edges} = addEntity(g, npc, {
            name: 'Bob', race: 'Human', traits: ['brave', 'loud'], currentLocation: 'Town', mood: 'happy',
            metadata: ['met in chapter 2'],
        });
        expect(node).toEqual({
            type: 'node',
            name: 'Bob',
            nodeType: 'npc',
            // No "name" (the node has one) and no "currentLocation" (the edge is the record).
            fields: {race: 'Human', traits: ['brave', 'loud'], mood: 'happy'},
            metadata: ['met in chapter 2'],
        });
        expect(Object.keys(node)).toEqual(['type', 'name', 'nodeType', 'fields', 'metadata']);
        expect(edges).toEqual([{type: 'edge', from: 'Bob', to: 'Town', edgeType: 'located_in'}]);
        expect(g.nodes).toContain(node);
        expect(g.edges).toEqual(edges);
    });

    it('stores each field in the type its schema gives it', () => {
        const {node} = addEntity(world(), npc, {
            name: 'Bob', race: 'Human', currentLocation: 'Town',
            traits: 'brave',            // one value for a list field
            age: 42, retired: false,    // extra fields keep the type they arrive in
            aliases: ['Bobby', 7],      // an extra list
            home: {city: 'Town'},       // an extra object
        });
        expect(node.fields).toEqual({
            race: 'Human', traits: ['brave'], age: 42, retired: false, aliases: ['Bobby', '7'], home: '{"city":"Town"}',
        });
        expect(() => addEntity(world(), npc, {name: 'Al', race: ['Human'], currentLocation: 'Town'}))
            .toThrow('"race" must be a single text value');
        expect(() => addEntity(world(), npc, {name: 'Al', race: 'Human', currentLocation: 'Town', traits: [{a: 1}]}))
            .toThrow('"traits" must be a list of text values');
        expect(() => addEntity(world(), npc, {name: 'Al', race: 'Human', currentLocation: 'Town', metadata: 'a note'}))
            .toThrow('"metadata" must be an array');
    });

    it('leaves out "fields" when there are none', () => {
        const place = parseSchema({name: 'add_place', description: 'd', properties: {}});
        expect(addEntity(world(), place, {name: 'Cave'}).node)
            .toEqual({type: 'node', name: 'Cave', nodeType: 'place', metadata: []});
    });

    it('accepts arrays for relationships and ignores repeated targets', () => {
        const {edges} = addEntity(world(), npc, {name: 'Bob', race: 'Elf', currentLocation: ['Town', 'Forest', 'Town']});
        expect(edges.map(e => e.to)).toEqual(['Town', 'Forest']);
    });

    it('lists all missing required fields at once', () => {
        expect(() => addEntity(world(), npc, {name: 'Bob'})).toThrow('race, currentLocation');
        expect(() => addEntity(world(), npc, {name: 'Bob', race: '  ', currentLocation: []})).toThrow('race, currentLocation');
    });

    it('explains a missing relationship target and changes nothing', () => {
        const g = world();
        expect(() => addEntity(g, npc, {name: 'Lilith', race: 'Elf', currentLocation: 'Unknown'}))
            .toThrow('no node named "Unknown" exists');
        // The node was appended before edge validation; GraphStore discards the whole change.
    });

    it('trims the name', () => {
        const g = world();
        const {node, edges} = addEntity(g, npc, {name: ' Bob ', race: 'Human', currentLocation: 'Town'});
        expect(node.name).toBe('Bob');
        expect(edges[0].from).toBe('Bob');
        expect(() => addEntity(g, npc, {name: 'Bob  ', race: 'Human', currentLocation: 'Town'})).toThrow('already exists');
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
        expect(addEntity(world(), strict, {name: 'A', metadata: ['a note']}).node.metadata).toEqual(['a note']);
    });
});

describe('typed fields', () => {
    const pet = parseSchema({
        name: 'add_pet',
        description: 'Add a pet',
        properties: {
            age: {type: 'number', description: 'Age in years'},
            vaccinated: {type: 'boolean', description: 'Has had its shots'},
            born: {type: 'date', description: 'Date of birth'},
            species: {type: 'string', description: 'Species'},
        },
    });
    const add = (fields: Record<string, unknown>) => addEntity(world(), pet, {name: 'Rex', ...fields}).node.fields;

    it('stores numbers, booleans and dates as such', () => {
        expect(add({age: 7, vaccinated: true, born: '2019-03-09', species: 'dog'}))
            .toEqual({age: 7, vaccinated: true, born: '2019-03-09', species: 'dog'});
        expect(add({age: 0, vaccinated: false})).toEqual({age: 0, vaccinated: false});
    });

    it('accepts the same values written as text', () => {
        expect(add({age: ' 7.5 ', vaccinated: 'TRUE', born: '2019-03-09T14:30:00Z', species: 3}))
            .toEqual({age: 7.5, vaccinated: true, born: '2019-03-09T14:30:00Z', species: '3'});
    });

    it('rejects values of the wrong type with a message the AI can act on', () => {
        expect(() => add({age: 'old'})).toThrow('"age" must be a number');
        expect(() => add({age: true})).toThrow('"age" must be a number');
        expect(() => add({vaccinated: 'yes'})).toThrow('"vaccinated" must be true or false');
        expect(() => add({born: 'last spring'})).toThrow('"born" must be a date written as YYYY-MM-DD');
        expect(() => add({born: '2019-02-31'})).toThrow('"born" must be a date written as YYYY-MM-DD');
        expect(() => add({born: 20190309})).toThrow('"born" must be a date');
    });

    it('updates and clears them like any other field', () => {
        const g = world();
        addEntity(g, pet, {name: 'Rex', age: 7, vaccinated: false});
        expect(updateEntity(g, pet, {name: 'Rex', age: 8, vaccinated: true}).node.fields).toEqual({age: 8, vaccinated: true});
        expect(updateEntity(g, pet, {name: 'Rex', age: ''}).node.fields).toEqual({vaccinated: true});
    });

    it('describes them to the client with the matching JSON type', () => {
        const props = (schemaTools(pet)[0].inputSchema.properties as any).pet.properties;
        expect(props.age).toEqual({type: 'number', description: 'Age in years'});
        expect(props.vaccinated).toEqual({type: 'boolean', description: 'Has had its shots'});
        expect(props.born).toEqual({type: 'string', description: 'Date of birth (a date written as YYYY-MM-DD)'});
    });

    it('only allows "enum" on text and list fields', () => {
        expect(() => parseSchema({
            name: 'add_x', description: 'd', properties: {n: {type: 'number', description: 'n', enum: ['1']}},
        })).toThrow('"enum" only works with the types "string" and "array"');
    });
});

describe('relationship targets', () => {
    const person = parseSchema({
        name: 'add_person',
        description: 'Add a person',
        properties: {
            home: {type: 'string', description: 'Home', relationship: {edgeType: 'lives_in', target: 'location'}},
            knows: {type: 'array', description: 'Knows', relationship: {edgeType: 'knows', target: ['person', 'npc']}},
            likes: {type: 'array', description: 'Likes', relationship: {edgeType: 'likes'}},
        },
    });

    it('accepts targets of an allowed type and rejects the rest', () => {
        const g = world();
        addEntity(g, person, {name: 'Ann', home: 'Town'});
        expect(addEntity(g, person, {name: 'Ben', home: 'Forest', knows: ['Ann'], likes: ['Town', 'Ann']}).edges)
            .toHaveLength(4);
        expect(() => addEntity(g, person, {name: 'Cat', home: 'Ann'}))
            .toThrow('Cannot link "Cat" to "Ann" via "home": "Ann" is a person, but "home" must name a location.');
        expect(() => updateEntity(g, person, {name: 'Ben', knows: ['Town']}))
            .toThrow('"Town" is a location, but "knows" must name a person or npc.');
    });

    it('tells the client what a relationship field may name', () => {
        const props = (schemaTools(person)[0].inputSchema.properties as any).person.properties;
        expect(props.home.items.description).toBe('The name of an existing location');
        expect(props.knows.items.description).toBe('The name of an existing person or npc');
        expect(props.likes.items.description).toBe('The name of an existing node');
    });

    it('requires "target" to be a node type or a list of them', () => {
        const withTarget = (target: unknown) => parseSchema({
            name: 'add_x', description: 'd',
            properties: {a: {type: 'string', description: 'd', relationship: {edgeType: 'e', target}}},
        });
        expect(() => withTarget('')).toThrow('"target" must be a node type or a list of node types');
        expect(() => withTarget([])).toThrow('"target" must be');
        expect(() => withTarget(['a', 3])).toThrow('"target" must be');
        expect(withTarget(['a', 'b']).properties.a.relationship!.target).toEqual(['a', 'b']);
    });
});

describe('enum fields', () => {
    it('rejects values outside the enum when adding, and saves nothing', () => {
        const g = world();
        expect(() => addEntity(g, npc, {name: 'Bob', race: 'Dwarf', currentLocation: 'Town'}))
            .toThrow('Invalid value for "race": "Dwarf". Allowed values: Human, Elf');
        expect(g).toEqual(world());
    });

    it('rejects values outside the enum when updating', () => {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town'});
        expect(() => updateEntity(g, npc, {name: 'Bob', race: 'human'})).toThrow('Allowed values: Human, Elf');
        expect(updateEntity(g, npc, {name: 'Bob', race: 'Elf'}).node.fields).toEqual({race: 'Elf'});
    });

    it('checks every item of an array field', () => {
        const schema = parseSchema({
            name: 'add_item',
            description: 'd',
            properties: {tags: {type: 'array', description: 'Tags', enum: ['rare', 'cursed']}},
        });
        expect(() => addEntity(world(), schema, {name: 'Ring', tags: ['rare', 'shiny', 7]}))
            .toThrow('Invalid value for "tags": "shiny", 7.');
        expect(addEntity(world(), schema, {name: 'Ring', tags: ['rare', 'cursed']}).node.fields)
            .toEqual({tags: ['rare', 'cursed']});
    });
});

describe('blank values', () => {
    it('are not stored when adding', () => {
        const {node, edges} = addEntity(world(), npc, {
            name: 'Bob', race: 'Human', currentLocation: 'Town', traits: [], allies: [], mood: '',
        });
        expect(node.fields).toEqual({race: 'Human'});
        expect(edges.map(e => e.edgeType)).toEqual(['located_in']);
    });

    it('clear a field, or the edges of a relationship field, when updating', () => {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town', traits: ['brave'], mood: 'calm', allies: ['Town']});
        const {node, removedEdges, addedEdges} = updateEntity(g, npc, {name: 'Bob', traits: [], mood: '', allies: []});
        expect(node.fields).toEqual({race: 'Human'});
        expect(removedEdges.map(e => e.edgeType)).toEqual(['allied_with']);
        expect(addedEdges).toEqual([]);
        expect(g.edges.map(e => e.edgeType)).toEqual(['located_in']);
    });

    it('cannot clear a required field', () => {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town'});
        expect(() => updateEntity(g, npc, {name: 'Bob', race: ''})).toThrow('"race" is required for npc and cannot be cleared');
        expect(() => updateEntity(g, npc, {name: 'Bob', currentLocation: []})).toThrow('"currentLocation" is required');
    });
});

describe('updateEntity', () => {
    function withBob(): Graph {
        const g = world();
        addEntity(g, npc, {name: 'Bob', race: 'Human', currentLocation: 'Town', mood: 'calm', metadata: ['a note']});
        return g;
    }

    it('changes only the fields that are passed', () => {
        const {node} = updateEntity(withBob(), npc, {name: 'Bob', race: 'Elf', title: 'Sir'});
        expect(node.fields).toEqual({race: 'Elf', mood: 'calm', title: 'Sir'});
        expect(node.metadata).toEqual(['a note']);
    });

    it('replaces relationship edges', () => {
        const g = withBob();
        const {node, removedEdges, addedEdges} = updateEntity(g, npc, {name: 'Bob', currentLocation: 'Forest'});
        expect(removedEdges.map(e => e.to)).toEqual(['Town']);
        expect(addedEdges.map(e => e.to)).toEqual(['Forest']);
        expect(g.edges).toEqual([{type: 'edge', from: 'Bob', to: 'Forest', edgeType: 'located_in'}]);
        expect(node.fields).toEqual({race: 'Human', mood: 'calm'});
    });

    it('replaces the notes, and only the notes, when "metadata" is given', () => {
        const {node} = updateEntity(withBob(), npc, {name: 'Bob', metadata: ['fresh start'], race: 'Elf'});
        expect(node.metadata).toEqual(['fresh start']);
        expect(node.fields).toEqual({race: 'Elf', mood: 'calm'});
    });

    it('removes an old-style "key: value" note when the field it describes is set', () => {
        const g = withBob();
        g.nodes[2].metadata.push('Mood: calm', 'currentLocation: Town', 'unrelated: note');
        const {node} = updateEntity(g, npc, {name: 'Bob', mood: 'angry', currentLocation: 'Forest'});
        expect(node.fields).toEqual({race: 'Human', mood: 'angry'});
        expect(node.metadata).toEqual(['a note', 'unrelated: note']);
    });

    it('only updates nodes of its own type', () => {
        expect(() => updateEntity(withBob(), npc, {name: 'Town'})).toThrow('npc "Town" not found ("Town" is a location)');
        expect(() => updateEntity(withBob(), npc, {name: 'Nobody'})).toThrow('npc "Nobody" not found');
    });
});

describe('convertNotesToFields', () => {
    /** A graph as v0.6 wrote it: every field of the schema tools is a "key: value" note. */
    function oldGraph(): Graph {
        return {
            nodes: [
                {type: 'node', name: 'Town', nodeType: 'location', metadata: ['name: Town', 'description: A town']},
                {
                    type: 'node', name: 'Bob', nodeType: 'npc', metadata: [
                        'name: Bob', 'race: Human', 'traits: brave, loud', 'currentLocation: Town',
                        'Mood: calm', 'a note without a colon', 'allies: Ann',
                    ],
                },
                {type: 'node', name: 'Rock', nodeType: 'thing', metadata: ['name: Rock', 'race: Stone']},
            ],
            edges: [{type: 'edge', from: 'Bob', to: 'Town', edgeType: 'located_in'}],
        };
    }

    it('moves the notes of schema fields into fields', () => {
        const g = oldGraph();
        expect(convertNotesToFields(g, [npc])).toBe(1);
        expect(g.nodes[1]).toEqual({
            type: 'node',
            name: 'Bob',
            nodeType: 'npc',
            fields: {race: 'Human', traits: ['brave', 'loud']},
            // "currentLocation" is gone because the located_in edge records it. "allies" stays:
            // there is no allied_with edge, so the note is the only record. "Mood" is not a schema field.
            metadata: ['Mood: calm', 'a note without a colon', 'allies: Ann'],
        });
        expect(g.edges).toHaveLength(1);
    });

    it('leaves nodes without a schema alone, and changes nothing on a second run', () => {
        const g = oldGraph();
        convertNotesToFields(g, [npc]);
        expect(g.nodes[0].metadata).toEqual(['name: Town', 'description: A town']);
        expect(g.nodes[2].metadata).toEqual(['name: Rock', 'race: Stone']);
        const after = structuredClone(g);
        expect(convertNotesToFields(g, [npc])).toBe(0);
        expect(g).toEqual(after);
    });

    it('converts to the type of the field, and keeps the note when the value does not fit', () => {
        const pet = parseSchema({
            name: 'add_pet', description: 'd',
            properties: {
                age: {type: 'number', description: 'Age'},
                vaccinated: {type: 'boolean', description: 'Shots'},
                born: {type: 'date', description: 'Born'},
            },
        });
        const g: Graph = {
            nodes: [
                {type: 'node', name: 'Rex', nodeType: 'pet', metadata: ['age: 7', 'vaccinated: true', 'born: 2019-03-09']},
                {type: 'node', name: 'Tom', nodeType: 'pet', metadata: ['age: quite old', 'vaccinated: probably', 'born: spring']},
            ],
            edges: [],
        };
        expect(convertNotesToFields(g, [pet])).toBe(1);
        expect(g.nodes[0]).toEqual({
            type: 'node', name: 'Rex', nodeType: 'pet', fields: {age: 7, vaccinated: true, born: '2019-03-09'}, metadata: [],
        });
        expect(g.nodes[1].fields).toBeUndefined();
        expect(g.nodes[1].metadata).toEqual(['age: quite old', 'vaccinated: probably', 'born: spring']);
    });

    it('never overwrites a field that already has a value', () => {
        const g = oldGraph();
        g.nodes[1].fields = {race: 'Elf'};
        convertNotesToFields(g, [npc]);
        expect(g.nodes[1].fields).toEqual({race: 'Elf', traits: ['brave', 'loud']});
        expect(g.nodes[1].metadata).toContain('race: Human');
    });
});
