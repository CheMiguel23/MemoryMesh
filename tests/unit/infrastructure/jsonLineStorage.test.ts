import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { JsonLineStorage } from '../../../src/infrastructure/storage/JsonLineStorage.js';
import type { Graph, Node, Edge } from '../../../src/core/index.js';

// Mock the fs module
vi.mock('fs');

// Mock CONFIG
vi.mock('@config/config.js', () => ({
    CONFIG: {
        PATHS: {
            MEMORY_FILE: '/tmp/test-memory.jsonl'
        }
    }
}));

describe('JsonLineStorage', () => {
    let storage: JsonLineStorage;
    const MEMORY_FILE = '/tmp/test-memory.jsonl';
    const MEMORY_DIR = '/tmp';

    beforeEach(() => {
        storage = new JsonLineStorage();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('ensureStorageExists()', () => {
        it('should create directory if it does not exist', async () => {
            const accessError = new Error('Not found');
            (accessError as any).code = 'ENOENT';

            vi.mocked(fs.access).mockRejectedValueOnce(accessError);
            vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
            vi.mocked(fs.access).mockResolvedValueOnce(undefined);
            vi.mocked(fs.readFile).mockResolvedValueOnce('');

            await storage.loadGraph();

            expect(fs.mkdir).toHaveBeenCalledWith(MEMORY_DIR, { recursive: true });
        });

        it('should create file if it does not exist', async () => {
            vi.mocked(fs.access).mockResolvedValueOnce(undefined); // dir exists
            
            const fileAccessError = new Error('Not found');
            (fileAccessError as any).code = 'ENOENT';
            vi.mocked(fs.access).mockRejectedValueOnce(fileAccessError);
            vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);
            vi.mocked(fs.readFile).mockResolvedValueOnce('');

            await storage.loadGraph();

            expect(fs.writeFile).toHaveBeenCalledWith(MEMORY_FILE, '');
        });

        it('should not reinitialize if already initialized', async () => {
            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue('');

            // First call
            await storage.loadGraph();
            const firstCallCount = vi.mocked(fs.access).mock.calls.length;

            // Second call
            await storage.loadGraph();
            const secondCallCount = vi.mocked(fs.access).mock.calls.length;

            // Should not increase access calls significantly
            expect(secondCallCount - firstCallCount).toBeLessThan(2);
        });

        it('should throw error if initialization fails', async () => {
            const error = new Error('Permission denied');
            vi.mocked(fs.access).mockRejectedValue(error);
            vi.mocked(fs.mkdir).mockRejectedValue(error);

            await expect(storage.loadGraph()).rejects.toThrow('Failed to initialize storage');
        });
    });

    describe('loadGraph()', () => {
        it('should load nodes and edges from storage', async () => {
            const fileContent = `{"type":"node","name":"node1","nodeType":"npc","metadata":[]}
{"type":"edge","from":"node1","to":"node2","edgeType":"knows"}`;

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(1);
            expect(graph.edges).toHaveLength(1);
            expect(graph.nodes[0].name).toBe('node1');
            expect(graph.edges[0].from).toBe('node1');
        });

        it('should handle empty storage file', async () => {
            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue('');

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
        });

        it('should skip malformed JSON lines', async () => {
            const fileContent = `{"type":"node","name":"valid","nodeType":"npc","metadata":[]}
{"invalid json
{"type":"edge","from":"node1","to":"node2","edgeType":"knows"}`;

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(1);
            expect(graph.edges).toHaveLength(1);
            // Should not throw, should skip malformed line
        });

        it('should handle file not found error gracefully', async () => {
            const notFoundError = new Error('File not found');
            (notFoundError as any).code = 'ENOENT';

            vi.mocked(fs.access).mockResolvedValueOnce(undefined);
            vi.mocked(fs.readFile).mockRejectedValue(notFoundError);

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
        });

        it('should parse multiple nodes and edges', async () => {
            const fileContent = `{"type":"node","name":"alice","nodeType":"npc","metadata":["friendly"]}
{"type":"node","name":"bob","nodeType":"npc","metadata":["shy"]}
{"type":"node","name":"location1","nodeType":"place","metadata":["tavern"]}
{"type":"edge","from":"alice","to":"bob","edgeType":"knows"}
{"type":"edge","from":"bob","to":"location1","edgeType":"livesIn"}
{"type":"edge","from":"alice","to":"location1","edgeType":"frequents"}`;

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(3);
            expect(graph.edges).toHaveLength(3);
        });

        it('should filter out empty lines', async () => {
            const fileContent = `{"type":"node","name":"node1","nodeType":"npc","metadata":[]}

{"type":"edge","from":"node1","to":"node2","edgeType":"knows"}

`;

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const graph = await storage.loadGraph();

            expect(graph.nodes).toHaveLength(1);
            expect(graph.edges).toHaveLength(1);
        });
    });

    describe('saveGraph()', () => {
        it('should write nodes and edges to file', async () => {
            const graph: Graph = {
                nodes: [
                    { type: 'node', name: 'node1', nodeType: 'npc', metadata: [] }
                ],
                edges: [
                    { type: 'edge', from: 'node1', to: 'node2', edgeType: 'knows' }
                ]
            };

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await storage.saveGraph(graph);

            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
            expect(writeCall[0]).toBe(MEMORY_FILE);
            expect(writeCall[1]).toContain('node1');
            expect(writeCall[1]).toContain('knows');
        });

        it('should format graph as JSON Lines', async () => {
            const graph: Graph = {
                nodes: [{ type: 'node', name: 'test', nodeType: 'npc', metadata: [] }],
                edges: []
            };

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await storage.saveGraph(graph);

            const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
            const content = writeCall[1] as string;
            const lines = content.split('\n').filter(l => l);

            expect(lines.every(l => {
                try {
                    JSON.parse(l);
                    return true;
                } catch {
                    return false;
                }
            })).toBe(true);
        });

        it('should handle empty graph', async () => {
            const graph: Graph = { nodes: [], edges: [] };

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await storage.saveGraph(graph);

            const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
            expect(writeCall[1]).toBe('');
        });

        it('should preserve node and edge data during save', async () => {
            const node: Node = {
                type: 'node',
                name: 'complex-node',
                nodeType: 'entity',
                metadata: ['meta1', 'meta2']
            };

            const edge: Edge = {
                type: 'edge',
                from: 'node1',
                to: 'node2',
                edgeType: 'relationship',
                weight: 0.85
            };

            const graph: Graph = { nodes: [node], edges: [edge] };

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await storage.saveGraph(graph);

            const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
            const content = writeCall[1] as string;

            expect(content).toContain('complex-node');
            expect(content).toContain('relationship');
            expect(content).toContain('0.85');
        });
    });

    describe('loadEdgesByIds()', () => {
        it('should load specific edges by their IDs', async () => {
            const graph: Graph = {
                nodes: [],
                edges: [
                    { type: 'edge', from: 'a', to: 'b', edgeType: 'type1' },
                    { type: 'edge', from: 'b', to: 'c', edgeType: 'type2' }
                ]
            };

            const fileContent = graph.edges
                .map(e => JSON.stringify({ ...e, type: 'edge' }))
                .join('\n');

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const edgeIds = ['a|b|type1'];
            const edges = await storage.loadEdgesByIds(edgeIds);

            expect(edges).toHaveLength(1);
            expect(edges[0].from).toBe('a');
            expect(edges[0].to).toBe('b');
        });

        it('should return empty array for non-existent edge IDs', async () => {
            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue('');

            const edges = await storage.loadEdgesByIds(['nonexistent|id|here']);

            expect(edges).toHaveLength(0);
        });

        it('should handle multiple edge IDs', async () => {
            const graph: Graph = {
                nodes: [],
                edges: [
                    { type: 'edge', from: 'a', to: 'b', edgeType: 'type1' },
                    { type: 'edge', from: 'b', to: 'c', edgeType: 'type2' },
                    { type: 'edge', from: 'c', to: 'd', edgeType: 'type3' }
                ]
            };

            const fileContent = graph.edges
                .map(e => JSON.stringify({ ...e, type: 'edge' }))
                .join('\n');

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const edgeIds = ['a|b|type1', 'b|c|type2', 'c|d|type3'];
            const edges = await storage.loadEdgesByIds(edgeIds);

            expect(edges).toHaveLength(3);
        });

        it('should filter out non-matching edge IDs', async () => {
            const graph: Graph = {
                nodes: [],
                edges: [
                    { type: 'edge', from: 'a', to: 'b', edgeType: 'type1' }
                ]
            };

            const fileContent = graph.edges
                .map(e => JSON.stringify({ ...e, type: 'edge' }))
                .join('\n');

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const edgeIds = ['a|b|type1', 'nonexistent|id', 'another|fake'];
            const edges = await storage.loadEdgesByIds(edgeIds);

            expect(edges).toHaveLength(1);
        });
    });

    describe('Edge indexing (private methods)', () => {
        it('should build indices during loadGraph', async () => {
            const fileContent = `{"type":"edge","from":"node1","to":"node2","edgeType":"knows"}
{"type":"edge","from":"node1","to":"node3","edgeType":"knows"}
{"type":"edge","from":"node2","to":"node3","edgeType":"loves"}`;

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue(fileContent);

            const graph = await storage.loadGraph();

            expect(graph.edges).toHaveLength(3);
            // Indices should be built internally
        });

        it('should clear indices when loading new graph', async () => {
            // First load
            const fileContent1 = `{"type":"edge","from":"a","to":"b","edgeType":"type1"}`;
            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValueOnce(fileContent1);

            await storage.loadGraph();

            // Second load with different data
            const fileContent2 = `{"type":"edge","from":"x","to":"y","edgeType":"type2"}`;
            vi.mocked(fs.readFile).mockResolvedValueOnce(fileContent2);

            const graph = await storage.loadGraph();

            expect(graph.edges).toHaveLength(1);
            expect(graph.edges[0].from).toBe('x');
        });
    });

    describe('Integration scenarios', () => {
        it('should handle save and load cycle', async () => {
            const originalGraph: Graph = {
                nodes: [
                    { type: 'node', name: 'alice', nodeType: 'character', metadata: ['hero'] },
                    { type: 'node', name: 'bob', nodeType: 'character', metadata: ['sidekick'] }
                ],
                edges: [
                    { type: 'edge', from: 'alice', to: 'bob', edgeType: 'mentors' }
                ]
            };

            let savedContent = '';

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockImplementation(async (path, content) => {
                savedContent = content as string;
                return undefined;
            });

            // Save
            await storage.saveGraph(originalGraph);

            // Update mock to return saved content
            vi.mocked(fs.readFile).mockResolvedValue(savedContent);

            // Load
            const loadedGraph = await storage.loadGraph();

            expect(loadedGraph.nodes).toHaveLength(2);
            expect(loadedGraph.edges).toHaveLength(1);
        });

        it('should handle large graphs', async () => {
            const largeGraph: Graph = {
                nodes: Array.from({ length: 100 }, (_, i) => ({
                    type: 'node' as const,
                    name: `node${i}`,
                    nodeType: 'entity',
                    metadata: []
                })),
                edges: Array.from({ length: 50 }, (_, i) => ({
                    type: 'edge' as const,
                    from: `node${i}`,
                    to: `node${i + 1}`,
                    edgeType: 'connects'
                }))
            };

            vi.mocked(fs.access).mockResolvedValue(undefined);

            let savedContent = '';
            vi.mocked(fs.writeFile).mockImplementation(async (path, content) => {
                savedContent = content as string;
                return undefined;
            });

            await storage.saveGraph(largeGraph);
            
            // Update mock after save
            vi.mocked(fs.readFile).mockResolvedValue(savedContent);
            
            const loaded = await storage.loadGraph();

            expect(loaded.nodes.length).toBeGreaterThan(0);
            expect(loaded.edges.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle read errors gracefully', async () => {
            const readError = new Error('Read failed');
            (readError as any).code = 'EACCES';

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockRejectedValue(readError);

            await expect(storage.loadGraph()).rejects.toThrow();
        });

        it('should handle write errors gracefully', async () => {
            const writeError = new Error('Write failed');

            vi.mocked(fs.access).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockRejectedValue(writeError);

            await expect(
                storage.saveGraph({ nodes: [], edges: [] })
            ).rejects.toThrow();
        });
    });
});
