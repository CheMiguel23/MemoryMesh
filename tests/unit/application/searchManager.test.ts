import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchManager } from '../../../src/application/managers/SearchManager.js';
import type { Graph, Node, Edge } from '../../../src/core/index.js';
import type { IStorage } from '../../../src/infrastructure/index.js';

describe('SearchManager', () => {
    let manager: SearchManager;
    let mockStorage: IStorage;

    const sampleNodes: Node[] = [
        {
            type: 'node',
            name: 'alice',
            nodeType: 'character',
            metadata: ['protagonist', 'brave']
        },
        {
            type: 'node',
            name: 'bob',
            nodeType: 'character',
            metadata: ['sidekick', 'loyal']
        },
        {
            type: 'node',
            name: 'tavern',
            nodeType: 'location',
            metadata: ['meeting-place']
        },
        {
            type: 'node',
            name: 'sword',
            nodeType: 'item',
            metadata: ['weapon', 'magical']
        }
    ];

    const sampleEdges: Edge[] = [
        { type: 'edge', from: 'alice', to: 'bob', edgeType: 'knows' },
        { type: 'edge', from: 'alice', to: 'tavern', edgeType: 'frequents' },
        { type: 'edge', from: 'bob', to: 'tavern', edgeType: 'works' },
        { type: 'edge', from: 'alice', to: 'sword', edgeType: 'wields' }
    ];

    const sampleGraph: Graph = {
        nodes: sampleNodes,
        edges: sampleEdges
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorage = {
            loadGraph: vi.fn().mockResolvedValue(sampleGraph)
        } as unknown as IStorage;

        manager = new SearchManager(mockStorage);
    });

    describe('searchNodes()', () => {
        it('should find nodes by name', async () => {
            const result = await manager.searchNodes('alice');

            expect(result.nodes).toContain(sampleNodes[0]);
        });

        it('should find nodes by type', async () => {
            const result = await manager.searchNodes('character');

            expect(result.nodes).toContainEqual(sampleNodes[0]);
            expect(result.nodes).toContainEqual(sampleNodes[1]);
        });

        it('should find nodes by metadata', async () => {
            const result = await manager.searchNodes('brave');

            expect(result.nodes).toContainEqual(sampleNodes[0]);
        });

        it('should be case-insensitive', async () => {
            const result1 = await manager.searchNodes('ALICE');
            const result2 = await manager.searchNodes('alice');

            expect(result1.nodes).toEqual(result2.nodes);
        });

        it('should include neighbors of matching nodes', async () => {
            const result = await manager.searchNodes('alice');

            const nodeNames = result.nodes.map(n => n.name);
            expect(nodeNames).toContain('alice'); // matching node
            expect(nodeNames).toContain('bob'); // neighbor
            expect(nodeNames).toContain('tavern'); // neighbor
            expect(nodeNames).toContain('sword'); // neighbor
        });

        it('should include edges to neighbors', async () => {
            const result = await manager.searchNodes('alice');

            expect(result.edges.length).toBeGreaterThan(0);
            expect(result.edges).toContainEqual(sampleEdges[0]); // alice-bob
        });

        it('should handle partial matches', async () => {
            const result = await manager.searchNodes('ar');

            const nodeNames = result.nodes.map(n => n.name);
            // Search for 'ar' should match nodes with 'character' nodeType (alice, bob)
            expect(nodeNames.length).toBeGreaterThan(0);
            expect(result.nodes.some(n => n.nodeType === 'character')).toBe(true);
        });

        it('should return empty result for non-matching query', async () => {
            const result = await manager.searchNodes('nonexistent');

            expect(result.nodes).toHaveLength(0);
            expect(result.edges).toHaveLength(0);
        });

        it('should emit search events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.searchNodes('alice');

            expect(emitSpy).toHaveBeenCalledWith(
                'beforeSearch',
                expect.objectContaining({ query: 'alice' })
            );
            expect(emitSpy).toHaveBeenCalledWith(
                'afterSearch',
                expect.any(Object)
            );
        });

        it('should handle search with metadata containing special characters', async () => {
            const graphWithSpecial: Graph = {
                nodes: [
                    {
                        type: 'node',
                        name: 'special',
                        nodeType: 'type',
                        metadata: ['tag-with-dashes', 'tag_with_underscores']
                    }
                ],
                edges: []
            };
            vi.mocked(mockStorage.loadGraph).mockResolvedValue(graphWithSpecial);

            const result = await manager.searchNodes('dashes');

            expect(result.nodes).toHaveLength(1);
        });
    });

    describe('openNodes()', () => {
        it('should open a single node', async () => {
            const result = await manager.openNodes(['alice']);

            expect(result.nodes.map(n => n.name)).toContain('alice');
        });

        it('should open multiple nodes', async () => {
            const result = await manager.openNodes(['alice', 'bob']);

            const nodeNames = result.nodes.map(n => n.name);
            expect(nodeNames).toContain('alice');
            expect(nodeNames).toContain('bob');
        });

        it('should include neighbors of opened nodes', async () => {
            const result = await manager.openNodes(['alice']);

            const nodeNames = result.nodes.map(n => n.name);
            expect(nodeNames).toContain('alice'); // requested
            expect(nodeNames).toContain('bob'); // neighbor
            expect(nodeNames).toContain('tavern'); // neighbor
        });

        it('should include edges between opened nodes and neighbors', async () => {
            const result = await manager.openNodes(['alice']);

            expect(result.edges.length).toBeGreaterThan(0);
            result.edges.forEach(edge => {
                const validEdge = result.nodes.some(n => n.name === edge.from) &&
                                  result.nodes.some(n => n.name === edge.to);
                expect(validEdge).toBe(true);
            });
        });

        it('should handle non-existent node gracefully', async () => {
            const result = await manager.openNodes(['nonexistent']);

            expect(result.nodes).toHaveLength(0);
            expect(result.edges).toHaveLength(0);
        });

        it('should handle mix of existent and non-existent nodes', async () => {
            const result = await manager.openNodes(['alice', 'nonexistent']);

            expect(result.nodes.map(n => n.name)).toContain('alice');
        });

        it('should emit openNodes events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.openNodes(['alice', 'bob']);

            expect(emitSpy).toHaveBeenCalledWith(
                'beforeOpenNodes',
                expect.objectContaining({ names: ['alice', 'bob'] })
            );
            expect(emitSpy).toHaveBeenCalledWith('afterOpenNodes', expect.any(Object));
        });

        it('should handle empty node list', async () => {
            const result = await manager.openNodes([]);

            expect(result.nodes).toHaveLength(0);
            expect(result.edges).toHaveLength(0);
        });
    });

    describe('readGraph()', () => {
        it('should return entire graph', async () => {
            const result = await manager.readGraph();

            expect(result.nodes).toHaveLength(sampleNodes.length);
            expect(result.edges).toHaveLength(sampleEdges.length);
        });

        it('should return all nodes', async () => {
            const result = await manager.readGraph();

            sampleNodes.forEach(node => {
                expect(result.nodes).toContainEqual(node);
            });
        });

        it('should return all edges', async () => {
            const result = await manager.readGraph();

            sampleEdges.forEach(edge => {
                expect(result.edges).toContainEqual(edge);
            });
        });

        it('should emit readGraph events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.readGraph();

            expect(emitSpy).toHaveBeenCalledWith('beforeReadGraph', {});
            expect(emitSpy).toHaveBeenCalledWith('afterReadGraph', expect.any(Object));
        });

        it('should handle empty graph', async () => {
            vi.mocked(mockStorage.loadGraph).mockResolvedValue({
                nodes: [],
                edges: []
            });

            const result = await manager.readGraph();

            expect(result.nodes).toHaveLength(0);
            expect(result.edges).toHaveLength(0);
        });

        it('should handle large graphs', async () => {
            const largeGraph: Graph = {
                nodes: Array.from({ length: 1000 }, (_, i) => ({
                    type: 'node' as const,
                    name: `node${i}`,
                    nodeType: 'entity',
                    metadata: []
                })),
                edges: Array.from({ length: 500 }, (_, i) => ({
                    type: 'edge' as const,
                    from: `node${i}`,
                    to: `node${i + 1}`,
                    edgeType: 'connects'
                }))
            };
            vi.mocked(mockStorage.loadGraph).mockResolvedValue(largeGraph);

            const result = await manager.readGraph();

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.edges.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle storage errors in searchNodes', async () => {
            const error = new Error('Storage error');
            vi.mocked(mockStorage.loadGraph).mockRejectedValue(error);

            await expect(manager.searchNodes('query')).rejects.toThrow('Search operation failed');
        });

        it('should handle storage errors in openNodes', async () => {
            const error = new Error('Storage error');
            vi.mocked(mockStorage.loadGraph).mockRejectedValue(error);

            await expect(manager.openNodes(['node'])).rejects.toThrow('Failed to open nodes');
        });

        it('should handle storage errors in readGraph', async () => {
            const error = new Error('Storage error');
            vi.mocked(mockStorage.loadGraph).mockRejectedValue(error);

            await expect(manager.readGraph()).rejects.toThrow('Failed to read graph');
        });

        it('should handle non-Error exceptions', async () => {
            vi.mocked(mockStorage.loadGraph).mockRejectedValue('string error');

            await expect(manager.searchNodes('query')).rejects.toThrow();
        });
    });

    describe('Integration scenarios', () => {
        it('should find connected component through search', async () => {
            // Search for alice should find entire connected component
            const result = await manager.searchNodes('alice');

            // All 4 nodes are connected to alice (directly or through neighbors)
            const nodeNames = result.nodes.map(n => n.name);
            expect(nodeNames).toContain('alice');
            expect(nodeNames).toContain('bob');
            expect(nodeNames).toContain('tavern');
            expect(nodeNames).toContain('sword');
        });

        it('should maintain graph consistency in results', async () => {
            const result = await manager.searchNodes('alice');

            // All edges should reference nodes in result
            result.edges.forEach(edge => {
                const fromExists = result.nodes.some(n => n.name === edge.from);
                const toExists = result.nodes.some(n => n.name === edge.to);
                expect(fromExists && toExists).toBe(true);
            });
        });

        it('should handle multiple searches on same graph', async () => {
            const result1 = await manager.searchNodes('character');
            const result2 = await manager.searchNodes('location');

            expect(result1.nodes.length).toBeGreaterThan(0);
            expect(result2.nodes.length).toBeGreaterThan(0);
            expect(mockStorage.loadGraph).toHaveBeenCalledTimes(2);
        });

        it('should provide correct view for different node selections', async () => {
            const searchResult = await manager.searchNodes('alice');
            const openResult = await manager.openNodes(['bob', 'tavern']);

            expect(searchResult.nodes.length).toBeGreaterThanOrEqual(1);
            expect(openResult.nodes.length).toBeGreaterThanOrEqual(2);
        });
    });
});
