import {describe, expect, it} from 'vitest';
import * as graph from '../src/graph.js';
import type {Graph} from '../src/types.js';

function sample(): Graph {
    return {
        nodes: [
            {type: 'node', name: 'Aragorn', nodeType: 'npc', metadata: ['race: Human']},
            {type: 'node', name: 'Rivendell', nodeType: 'location', metadata: ['region: Eriador']},
            {type: 'node', name: 'Anduril', nodeType: 'artifact', metadata: []},
        ],
        edges: [
            {type: 'edge', from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in'},
        ],
    };
}

describe('nodes', () => {
    it('adds nodes and normalizes them', () => {
        const g = sample();
        const added = graph.addNodes(g, [{name: 'Frodo', nodeType: 'npc', metadata: ['race: Hobbit'], extra: 1}]);
        expect(added).toEqual([{type: 'node', name: 'Frodo', nodeType: 'npc', metadata: ['race: Hobbit']}]);
        expect(g.nodes).toHaveLength(4);
    });

    it('defaults metadata to an empty list', () => {
        const g = sample();
        expect(graph.addNodes(g, [{name: 'Sam', nodeType: 'npc'}])[0].metadata).toEqual([]);
    });

    it('rejects duplicates, both existing and within one batch', () => {
        expect(() => graph.addNodes(sample(), [{name: 'Aragorn', nodeType: 'npc'}])).toThrow('already exists');
        expect(() => graph.addNodes(sample(), [
            {name: 'X', nodeType: 't'}, {name: 'X', nodeType: 't'},
        ])).toThrow('already exists');
    });

    it('validates input shape', () => {
        expect(() => graph.addNodes(sample(), 'nope')).toThrow('"nodes" must be an array');
        expect(() => graph.addNodes(sample(), [{nodeType: 'npc'}])).toThrow('nodes[0].name');
        expect(() => graph.addNodes(sample(), [{name: 'A', nodeType: 'npc', metadata: [1]}])).toThrow('must be a string');
    });

    it('updates only nodeType and metadata', () => {
        const g = sample();
        const [node] = graph.updateNodes(g, [{name: 'Aragorn', metadata: ['title: King'], type: 'edge'}]);
        expect(node).toEqual({type: 'node', name: 'Aragorn', nodeType: 'npc', metadata: ['title: King']});
    });

    it('adds and updates fields', () => {
        const g = sample();
        const [ring] = graph.addNodes(g, [{name: 'Ring', nodeType: 'item', fields: {owner: 'Frodo', powers: ['invisibility'], empty: ''}}]);
        expect(ring).toEqual({type: 'node', name: 'Ring', nodeType: 'item', fields: {owner: 'Frodo', powers: ['invisibility']}, metadata: []});
        graph.updateNodes(g, [{name: 'Ring', fields: {weight: 0, cursed: false}}]);
        expect(ring.fields).toEqual({owner: 'Frodo', powers: ['invisibility'], weight: 0, cursed: false});
        expect(graph.searchNodes({...g, edges: []}, 'cursed: false weight: 0').nodes.map(n => n.name)).toEqual(['Ring']);
        graph.updateNodes(g, [{name: 'Ring', fields: {weight: '', cursed: ''}}]);
        expect(Object.keys(ring)).toEqual(['type', 'name', 'nodeType', 'fields', 'metadata']);

        // Only the fields that are passed change; a blank value removes one.
        graph.updateNodes(g, [{name: 'Ring', fields: {owner: 'Gollum', powers: []}}]);
        expect(ring.fields).toEqual({owner: 'Gollum'});
        graph.updateNodes(g, [{name: 'Ring', fields: {owner: ' '}}]);
        expect(ring).toEqual({type: 'node', name: 'Ring', nodeType: 'item', metadata: []});

        expect(() => graph.addNodes(g, [{name: 'X', nodeType: 't', fields: ['a']}])).toThrow('nodes[0].fields must be an object');
        expect(() => graph.updateNodes(g, [{name: 'Ring', fields: {weight: [3]}}])).toThrow('fields.weight must be a string, a number');
        expect(() => graph.updateNodes(g, [{name: 'Ring', fields: {weight: NaN}}])).toThrow('fields.weight must be');
    });

    it('trims names when adding, so " Sam " cannot exist next to "Sam"', () => {
        const g = sample();
        expect(graph.addNodes(g, [{name: '  Sam ', nodeType: 'npc'}])[0].name).toBe('Sam');
        expect(() => graph.addNodes(g, [{name: 'Sam  ', nodeType: 'npc'}])).toThrow('already exists');
    });

    it('renames a node, its edges and the metadata that refers to it', () => {
        const g: Graph = {
            nodes: [
                {type: 'node', name: 'Town', nodeType: 'location', metadata: ['name: Town', 'a note about Town']},
                {type: 'node', name: 'Bob', nodeType: 'npc', metadata: ['currentLocation: Town', 'visited: Fort, Town', 'likes Town']},
                {type: 'node', name: 'Eve', nodeType: 'npc', metadata: ['hometown: Town']},
            ],
            edges: [
                {type: 'edge', from: 'Bob', to: 'Town', edgeType: 'located_in'},
                {type: 'edge', from: 'Town', to: 'Bob', edgeType: 'governed_by', weight: 0.5},
            ],
        };
        const [town] = graph.updateNodes(g, [{name: 'Town', newName: ' Riverton '}]);

        expect(town.name).toBe('Riverton');
        expect(town.metadata).toEqual(['name: Riverton', 'a note about Town']);
        expect(g.edges).toEqual([
            {type: 'edge', from: 'Bob', to: 'Riverton', edgeType: 'located_in'},
            {type: 'edge', from: 'Riverton', to: 'Bob', edgeType: 'governed_by', weight: 0.5},
        ]);
        // Bob links to the town, so entries naming it follow the rename; free text is left alone.
        expect(g.nodes[1].metadata).toEqual(['currentLocation: Riverton', 'visited: Fort, Riverton', 'likes Town']);
        // Eve has no edge to the town, so her metadata is not touched.
        expect(g.nodes[2].metadata).toEqual(['hometown: Town']);
        expect(graph.findNode(g, 'Town')).toBeUndefined();
    });

    it('refuses to rename onto an existing node, and accepts the current name', () => {
        const g = sample();
        expect(() => graph.updateNodes(g, [{name: 'Aragorn', newName: 'Rivendell'}])).toThrow('already exists');
        expect(() => graph.updateNodes(g, [{name: 'Aragorn', newName: ' '}])).toThrow('non-empty string');
        expect(graph.updateNodes(g, [{name: 'Aragorn', newName: 'Aragorn'}])[0].name).toBe('Aragorn');
    });

    it('fails to update a missing node', () => {
        expect(() => graph.updateNodes(sample(), [{name: 'Nobody'}])).toThrow('Node not found');
    });

    it('deletes nodes with their edges and reports which existed', () => {
        const g = sample();
        expect(graph.deleteNodes(g, ['Rivendell', 'Nowhere'])).toEqual(['Rivendell']);
        expect(g.nodes.map(n => n.name)).toEqual(['Aragorn', 'Anduril']);
        expect(g.edges).toEqual([]);
    });
});

describe('edges', () => {
    it('adds an edge, keeping weight only when given', () => {
        const g = sample();
        const added = graph.addEdges(g, [
            {from: 'Aragorn', to: 'Anduril', edgeType: 'owns', weight: 0.5},
            {from: 'Anduril', to: 'Rivendell', edgeType: 'forged_near'},
        ]);
        expect(added[0]).toEqual({type: 'edge', from: 'Aragorn', to: 'Anduril', edgeType: 'owns', weight: 0.5});
        expect(added[1]).not.toHaveProperty('weight');
    });

    it('rejects missing nodes, duplicates and bad weights', () => {
        expect(() => graph.addEdges(sample(), [{from: 'Aragorn', to: 'Mordor', edgeType: 'x'}])).toThrow('"Mordor"');
        expect(() => graph.addEdges(sample(), [{from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in'}]))
            .toThrow('already exists');
        expect(() => graph.addEdges(sample(), [
            {from: 'Aragorn', to: 'Anduril', edgeType: 'owns'},
            {from: 'Aragorn', to: 'Anduril', edgeType: 'owns'},
        ])).toThrow('already exists');
        for (const weight of [-0.1, 1.1, 'high']) {
            expect(() => graph.addEdges(sample(), [{from: 'Aragorn', to: 'Anduril', edgeType: 'owns', weight}]))
                .toThrow('between 0 and 1');
        }
    });

    it('does not modify the graph when any edge in the batch is invalid', () => {
        const g = sample();
        expect(() => graph.addEdges(g, [
            {from: 'Aragorn', to: 'Anduril', edgeType: 'owns'},
            {from: 'Aragorn', to: 'Mordor', edgeType: 'goes_to'},
        ])).toThrow();
        expect(g.edges).toHaveLength(1);
    });

    it('updates an edge', () => {
        const g = sample();
        const [edge] = graph.updateEdges(g, [
            {from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in', newTo: 'Anduril', newEdgeType: 'owns', newWeight: 0.9},
        ]);
        expect(edge).toEqual({type: 'edge', from: 'Aragorn', to: 'Anduril', edgeType: 'owns', weight: 0.9});
        expect(g.edges).toEqual([edge]);
    });

    it('refuses edge updates that point to missing nodes or create duplicates', () => {
        expect(() => graph.updateEdges(sample(), [{from: 'Aragorn', to: 'Rivendell', edgeType: 'nope'}]))
            .toThrow('Edge not found');
        expect(() => graph.updateEdges(sample(), [
            {from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in', newTo: 'Mordor'},
        ])).toThrow('"Mordor"');

        const g = sample();
        graph.addEdges(g, [{from: 'Aragorn', to: 'Anduril', edgeType: 'located_in'}]);
        expect(() => graph.updateEdges(g, [
            {from: 'Aragorn', to: 'Anduril', edgeType: 'located_in', newTo: 'Rivendell'},
        ])).toThrow('already exists');
    });

    it('deletes edges and counts them', () => {
        const g = sample();
        expect(graph.deleteEdges(g, [{from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in'}])).toBe(1);
        expect(graph.deleteEdges(g, [{from: 'Aragorn', to: 'Rivendell', edgeType: 'located_in'}])).toBe(0);
    });
});

describe('metadata', () => {
    it('adds only new entries', () => {
        const g = sample();
        const result = graph.addMetadata(g, [{nodeName: 'Aragorn', contents: ['race: Human', 'title: Ranger', 'title: Ranger']}]);
        expect(result).toEqual([{nodeName: 'Aragorn', addedMetadata: ['title: Ranger']}]);
        expect(g.nodes[0].metadata).toEqual(['race: Human', 'title: Ranger']);
    });

    it('deletes exact entries', () => {
        const g = sample();
        expect(graph.deleteMetadata(g, [{nodeName: 'Aragorn', metadata: ['race: Human', 'missing']}])).toBe(1);
        expect(g.nodes[0].metadata).toEqual([]);
    });

    it('requires the node to exist', () => {
        expect(() => graph.addMetadata(sample(), [{nodeName: 'Nobody', contents: ['a']}])).toThrow('Node not found');
    });
});

describe('reading', () => {
    it('searches names, types and metadata case-insensitively and includes neighbours', () => {
        const result = graph.searchNodes(sample(), 'HUMAN');
        expect(result.nodes.map(n => n.name)).toEqual(['Aragorn', 'Rivendell']);
        expect(result.edges).toHaveLength(1);
        expect(graph.searchNodes(sample(), 'artifact').nodes.map(n => n.name)).toEqual(['Anduril']);
    });

    it('searches fields and what a node links to', () => {
        const g: Graph = {
            nodes: [
                {type: 'node', name: 'Bob', nodeType: 'npc', fields: {role: 'Blacksmith', traits: ['gruff', 'kind']}, metadata: []},
                {type: 'node', name: 'Ann', nodeType: 'npc', fields: {role: 'Baker'}, metadata: []},
                {type: 'node', name: 'Riverton', nodeType: 'location', metadata: []},
            ],
            edges: [
                {type: 'edge', from: 'Bob', to: 'Riverton', edgeType: 'located_in'},
                {type: 'edge', from: 'Ann', to: 'Riverton', edgeType: 'located_in'},
            ],
        };
        const matches = (query: string) => graph.searchNodes({...g, edges: []}, query).nodes.map(n => n.name);
        expect(matches('blacksmith')).toEqual(['Bob']);
        expect(matches('traits: gruff, kind')).toEqual(['Bob']);

        // A word may be satisfied by a link, as long as another word is about the node itself.
        expect(graph.searchNodes(g, 'blacksmith riverton').nodes.map(n => n.name)).toEqual(['Bob', 'Riverton']);
        expect(graph.searchNodes(g, 'baker located_in').nodes.map(n => n.name)).toEqual(['Ann', 'Riverton']);
        // The name of a hub matches the hub, not everything linked to it (they come along as neighbours).
        const hub = graph.searchNodes(g, 'riverton');
        expect(hub.nodes.map(n => n.name)).toEqual(['Riverton', 'Bob', 'Ann']);
    });

    it('matches nodes that contain every word of the query, in any field and order', () => {
        const names = (query: string) => graph.searchNodes({...sample(), edges: []}, query).nodes.map(n => n.name);
        expect(names('human npc')).toEqual(['Aragorn']);
        expect(names('  NPC   aragorn ')).toEqual(['Aragorn']);
        expect(names('race: human')).toEqual(['Aragorn']);
        expect(names('human location')).toEqual([]);
    });

    describe('findNodes', () => {
        const people = (): Graph => ({
            nodes: [
                {type: 'node', name: 'Ann', nodeType: 'person', fields: {age: 34, role: 'Baker', skills: ['bread', 'Cakes'], born: '1990-05-01', active: true}, metadata: []},
                {type: 'node', name: 'Ben', nodeType: 'person', fields: {age: 9, role: 'pupil', born: '2015-11-20', active: false}, metadata: []},
                {type: 'node', name: 'Cid', nodeType: 'person', fields: {age: '70', role: 'baker'}, metadata: []},
                {type: 'node', name: 'Rex', nodeType: 'pet', fields: {age: 9}, metadata: []},
                {type: 'node', name: 'Town', nodeType: 'place', metadata: []},
            ],
            edges: [
                {type: 'edge', from: 'Ann', to: 'Town', edgeType: 'lives_in'},
                {type: 'edge', from: 'Ben', to: 'Town', edgeType: 'visits'},
                {type: 'edge', from: 'Rex', to: 'Ann', edgeType: 'owned_by'},
            ],
        });
        const names = (query: unknown) => graph.findNodes(people(), query).nodes.map(n => n.name);

        it('filters by type and by field values, ignoring case', () => {
            expect(names({nodeType: 'Person'})).toEqual(['Ann', 'Ben', 'Cid']);
            expect(names({where: {role: 'BAKER'}})).toEqual(['Ann', 'Cid']);
            expect(names({where: {age: 9}})).toEqual(['Ben', 'Rex']);
            expect(names({where: {age: '9'}, nodeType: 'pet'})).toEqual(['Rex']);
            expect(names({where: {active: true}})).toEqual(['Ann']);
            expect(names({where: {active: 'false'}})).toEqual(['Ben']);
            expect(names({where: {role: 'baker', age: 34}})).toEqual(['Ann']);
            expect(names({where: {shoeSize: 42}})).toEqual([]);
        });

        it('matches a list field that contains the value, and any of several values', () => {
            expect(names({where: {skills: 'cakes'}})).toEqual(['Ann']);
            expect(names({where: {role: ['pupil', 'baker']}})).toEqual(['Ann', 'Ben', 'Cid']);
        });

        it('matches ranges of numbers and dates', () => {
            expect(names({where: {age: {min: 10}}})).toEqual(['Ann', 'Cid']);
            expect(names({where: {age: {min: 9, max: 34}}})).toEqual(['Ann', 'Ben', 'Rex']);
            expect(names({where: {born: {max: '1999-12-31'}}})).toEqual(['Ann']);
            expect(names({where: {born: {min: '2000-01-01'}}})).toEqual(['Ben']);
        });

        it('filters by what a node links to', () => {
            expect(names({linkedTo: 'Town'})).toEqual(['Ann', 'Ben']);
            expect(names({linkedTo: 'Town', edgeType: 'lives_in'})).toEqual(['Ann']);
            expect(names({linkedTo: 'Town', nodeType: 'pet'})).toEqual([]);
        });

        it('returns the edges leaving the matches, and counts what the limit cut off', () => {
            const result = graph.findNodes(people(), {nodeType: 'person', limit: 2});
            expect(result.nodes.map(n => n.name)).toEqual(['Ann', 'Ben']);
            expect(result.total).toBe(3);
            expect(result.edges.map(e => `${e.from}>${e.to}`)).toEqual(['Ann>Town', 'Ben>Town']);
        });

        it('explains unusable arguments', () => {
            expect(() => names({})).toThrow('Give at least one of');
            expect(() => names({linkedTo: 'Nowhere'})).toThrow('Node not found: "Nowhere"');
            expect(() => names({edgeType: 'lives_in'})).toThrow('needs "linkedTo"');
            expect(() => names({nodeType: 'person', limit: 0})).toThrow('"limit" must be');
            expect(() => names({where: {age: {over: 5}}})).toThrow('where.age must be a value, a list of values, or a range');
            expect(() => names({where: {age: []}})).toThrow('where.age must list at least one value');
            expect(() => names({where: 'age > 5'})).toThrow('"where" must be an object');
        });
    });

    it('follows edges as far as "depth" says', () => {
        const chain: Graph = {
            nodes: ['A', 'B', 'C', 'D', 'E'].map(name => ({type: 'node', name, nodeType: 't', metadata: []})),
            edges: [
                {type: 'edge', from: 'A', to: 'B', edgeType: 'next'},
                {type: 'edge', from: 'C', to: 'B', edgeType: 'next'},
                {type: 'edge', from: 'C', to: 'D', edgeType: 'next'},
                {type: 'edge', from: 'D', to: 'E', edgeType: 'next'},
            ],
        };
        const open = (depth: number) => graph.openNodes(chain, ['A'], depth);
        expect(open(0)).toEqual({nodes: [chain.nodes[0]], edges: []});
        expect(open(1).nodes.map(n => n.name)).toEqual(['A', 'B']);
        expect(open(2).nodes.map(n => n.name)).toEqual(['A', 'B', 'C']);
        expect(open(2).edges).toHaveLength(2);
        expect(open(3).nodes.map(n => n.name)).toEqual(['A', 'B', 'C', 'D']);
        expect(() => open(4)).toThrow('"depth" must be a whole number from 0 to 3');
        expect(() => graph.openNodes(chain, ['A'], 1.5)).toThrow('"depth"');
    });

    it('opens nodes with neighbours', () => {
        const result = graph.openNodes(sample(), ['Rivendell']);
        expect(result.nodes.map(n => n.name)).toEqual(['Rivendell', 'Aragorn']);
        expect(graph.openNodes(sample(), ['Nobody'])).toEqual({nodes: [], edges: []});
    });
});
