import { describe, it, expect } from 'vitest';
import { GraphValidator } from '../../../src/core/graph/GraphValidator.js';
import type { Graph } from '../../../src/core/graph/Graph.js';
import type { Node } from '../../../src/core/graph/Node.js';
import type { Edge } from '../../../src/core/graph/Edge.js';

describe('GraphValidator', () => {
    const createNode = (name: string, nodeType: string = 'test'): Node => ({
        type: 'node',
        name,
        nodeType,
        metadata: []
    });

    const createEdge = (from: string, to: string, edgeType: string = 'related'): Edge => ({
        type: 'edge',
        from,
        to,
        edgeType
    });

    const createGraph = (nodes: Node[] = [], edges: Edge[] = []): Graph => ({
        nodes,
        edges
    });

    describe('validateNodeExists', () => {
        it('should pass when node exists', () => {
            const graph = createGraph([createNode('test')]);

            expect(() => GraphValidator.validateNodeExists(graph, 'test')).not.toThrow();
        });

        it('should throw when node does not exist', () => {
            const graph = createGraph([]);

            expect(() => GraphValidator.validateNodeExists(graph, 'missing'))
                .toThrow('Node not found: missing');
        });
    });

    describe('validateNodeDoesNotExist', () => {
        it('should pass when node does not exist', () => {
            const graph = createGraph([]);

            expect(() => GraphValidator.validateNodeDoesNotExist(graph, 'new')).not.toThrow();
        });

        it('should throw when node already exists', () => {
            const graph = createGraph([createNode('existing')]);

            expect(() => GraphValidator.validateNodeDoesNotExist(graph, 'existing'))
                .toThrow('Node already exists: existing');
        });
    });

    describe('validateEdgeUniqueness', () => {
        it('should pass for unique edge', () => {
            const graph = createGraph([createNode('a'), createNode('b')]);
            const edge = createEdge('a', 'b', 'knows');

            expect(() => GraphValidator.validateEdgeUniqueness(graph, edge)).not.toThrow();
        });

        it('should throw for duplicate edge', () => {
            const edge = createEdge('a', 'b', 'knows');
            const graph = createGraph([createNode('a'), createNode('b')], [edge]);

            expect(() => GraphValidator.validateEdgeUniqueness(graph, edge))
                .toThrow('Edge already exists: a -> b (knows)');
        });

        it('should allow different edge types between same nodes', () => {
            const edge1 = createEdge('a', 'b', 'knows');
            const edge2 = createEdge('a', 'b', 'likes');
            const graph = createGraph([createNode('a'), createNode('b')], [edge1]);

            expect(() => GraphValidator.validateEdgeUniqueness(graph, edge2)).not.toThrow();
        });
    });

    describe('validateNodeProperties', () => {
        it('should pass for valid node', () => {
            const node = createNode('valid', 'npc');

            expect(() => GraphValidator.validateNodeProperties(node)).not.toThrow();
        });

        it('should throw for node without name', () => {
            const node = { type: 'node', name: '', nodeType: 'npc', metadata: [] } as Node;

            expect(() => GraphValidator.validateNodeProperties(node))
                .toThrow("Node must have a 'name' property");
        });

        it('should throw for node without nodeType', () => {
            const node = { type: 'node', name: 'test', nodeType: '', metadata: [] } as Node;

            expect(() => GraphValidator.validateNodeProperties(node))
                .toThrow("Node must have a 'nodeType' property");
        });

        it('should throw for node without metadata array', () => {
            const node = { type: 'node', name: 'test', nodeType: 'npc', metadata: null } as any;

            expect(() => GraphValidator.validateNodeProperties(node))
                .toThrow("Node must have a 'metadata' array");
        });
    });

    describe('validateNodeNameProperty', () => {
        it('should pass for partial node with name', () => {
            const partialNode = { name: 'test' };

            expect(() => GraphValidator.validateNodeNameProperty(partialNode)).not.toThrow();
        });

        it('should throw for partial node without name', () => {
            const partialNode = { nodeType: 'npc' };

            expect(() => GraphValidator.validateNodeNameProperty(partialNode))
                .toThrow("Node must have a 'name' property for updating");
        });
    });

    describe('validateNodeNamesArray', () => {
        it('should pass for valid array of strings', () => {
            const names = ['node1', 'node2', 'node3'];

            expect(() => GraphValidator.validateNodeNamesArray(names)).not.toThrow();
        });

        it('should throw for non-array input', () => {
            expect(() => GraphValidator.validateNodeNamesArray('not-an-array'))
                .toThrow('nodeNames must be an array');
        });

        it('should throw for array with non-string elements', () => {
            const invalid = ['valid', 123, 'also-valid'];

            expect(() => GraphValidator.validateNodeNamesArray(invalid))
                .toThrow('All node names must be strings');
        });

        it('should pass for empty array', () => {
            expect(() => GraphValidator.validateNodeNamesArray([])).not.toThrow();
        });
    });

    describe('validateEdgeProperties', () => {
        it('should pass for valid edge', () => {
            const edge = createEdge('a', 'b', 'knows');

            expect(() => GraphValidator.validateEdgeProperties(edge)).not.toThrow();
        });

        it('should throw for edge without from', () => {
            const edge = { type: 'edge', from: '', to: 'b', edgeType: 'knows' } as Edge;

            expect(() => GraphValidator.validateEdgeProperties(edge))
                .toThrow("Edge must have a 'from' property");
        });

        it('should throw for edge without to', () => {
            const edge = { type: 'edge', from: 'a', to: '', edgeType: 'knows' } as Edge;

            expect(() => GraphValidator.validateEdgeProperties(edge))
                .toThrow("Edge must have a 'to' property");
        });

        it('should throw for edge without edgeType', () => {
            const edge = { type: 'edge', from: 'a', to: 'b', edgeType: '' } as Edge;

            expect(() => GraphValidator.validateEdgeProperties(edge))
                .toThrow("Edge must have an 'edgeType' property");
        });

        it('should pass for edge with valid weight', () => {
            const edge = { ...createEdge('a', 'b', 'knows'), weight: 0.5 };

            expect(() => GraphValidator.validateEdgeProperties(edge)).not.toThrow();
        });

        it('should throw for edge with invalid weight', () => {
            const edge = { ...createEdge('a', 'b', 'knows'), weight: 1.5 };

            expect(() => GraphValidator.validateEdgeProperties(edge))
                .toThrow('Edge weight must be between 0 and 1');
        });
    });

    describe('validateEdgeReferences', () => {
        it('should pass when all edge references exist', () => {
            const graph = createGraph([createNode('a'), createNode('b')]);
            const edges = [createEdge('a', 'b', 'knows')];

            expect(() => GraphValidator.validateEdgeReferences(graph, edges)).not.toThrow();
        });

        it('should throw when from node does not exist', () => {
            const graph = createGraph([createNode('b')]);
            const edges = [createEdge('missing', 'b', 'knows')];

            expect(() => GraphValidator.validateEdgeReferences(graph, edges))
                .toThrow('Node not found: missing');
        });

        it('should throw when to node does not exist', () => {
            const graph = createGraph([createNode('a')]);
            const edges = [createEdge('a', 'missing', 'knows')];

            expect(() => GraphValidator.validateEdgeReferences(graph, edges))
                .toThrow('Node not found: missing');
        });
    });

    describe('validateGraphStructure', () => {
        it('should pass for valid graph', () => {
            const graph = createGraph(
                [createNode('a'), createNode('b')],
                [createEdge('a', 'b', 'knows')]
            );

            expect(() => GraphValidator.validateGraphStructure(graph)).not.toThrow();
        });

        it('should pass for empty graph', () => {
            const graph = createGraph();

            expect(() => GraphValidator.validateGraphStructure(graph)).not.toThrow();
        });

        it('should throw for graph without nodes array', () => {
            const graph = { edges: [] } as any;

            expect(() => GraphValidator.validateGraphStructure(graph))
                .toThrow("Graph must have a 'nodes' array");
        });

        it('should throw for graph without edges array', () => {
            const graph = { nodes: [] } as any;

            expect(() => GraphValidator.validateGraphStructure(graph))
                .toThrow("Graph must have an 'edges' array");
        });

        it('should validate all nodes in graph', () => {
            const graph = createGraph([
                createNode('valid'),
                { type: 'node', name: '', nodeType: 'npc', metadata: [] } as Node
            ]);

            expect(() => GraphValidator.validateGraphStructure(graph)).toThrow();
        });

        it('should validate edge references', () => {
            const graph = createGraph(
                [createNode('a')],
                [createEdge('a', 'missing', 'knows')]
            );

            expect(() => GraphValidator.validateGraphStructure(graph))
                .toThrow('Node not found: missing');
        });
    });
});
