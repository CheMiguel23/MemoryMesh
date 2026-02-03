import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EdgeManager } from '../../../src/application/managers/EdgeManager.js';
import type { Edge, Graph, Node } from '../../../src/core/index.js';
import type { IStorage } from '../../../src/infrastructure/index.js';
import type { EdgeUpdate, EdgeFilter } from '../../../src/shared/index.js';

describe('EdgeManager', () => {
    let manager: EdgeManager;
    let mockStorage: IStorage;

    const sampleNodes: Node[] = [
        { type: 'node', name: 'alice', nodeType: 'character', metadata: [] },
        { type: 'node', name: 'bob', nodeType: 'character', metadata: [] },
        { type: 'node', name: 'carol', nodeType: 'character', metadata: [] }
    ];

    const sampleEdge: Edge = {
        type: 'edge',
        from: 'alice',
        to: 'bob',
        edgeType: 'knows'
    };

    const sampleGraph: Graph = {
        nodes: sampleNodes,
        edges: [sampleEdge]
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStorage = {
            loadGraph: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(sampleGraph))),
            saveGraph: vi.fn().mockResolvedValue(undefined)
        } as unknown as IStorage;

        manager = new EdgeManager(mockStorage);
    });

    describe('addEdges()', () => {
        it('should add valid edge', async () => {
            const newEdge: Edge = {
                type: 'edge',
                from: 'bob',
                to: 'carol',
                edgeType: 'knows'
            };

            const result = await manager.addEdges([newEdge]);

            expect(result).toHaveLength(1);
            expect(result[0].from).toBe('bob');
            expect(result[0].to).toBe('carol');
        });

        it('should add multiple edges', async () => {
            const newEdges = [
                { type: 'edge' as const, from: 'bob', to: 'carol', edgeType: 'knows' },
                { type: 'edge' as const, from: 'alice', to: 'carol', edgeType: 'mentors' }
            ];

            const result = await manager.addEdges(newEdges);

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('should emit beforeAddEdges and afterAddEdges events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const newEdge: Edge = {
                type: 'edge',
                from: 'bob',
                to: 'carol',
                edgeType: 'knows'
            };

            await manager.addEdges([newEdge]);

            expect(emitSpy).toHaveBeenCalledWith('beforeAddEdges', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterAddEdges', expect.any(Object));
        });

        it('should validate nodes exist before adding edge', async () => {
            const invalidEdge: Edge = {
                type: 'edge',
                from: 'nonexistent',
                to: 'alice',
                edgeType: 'knows'
            };

            await expect(manager.addEdges([invalidEdge])).rejects.toThrow();
        });

        it('should handle empty edge list', async () => {
            const result = await manager.addEdges([]);

            expect(result).toHaveLength(0);
        });
    });

    describe('updateEdges()', () => {
        it('should update edge weight', async () => {
            const update: EdgeUpdate = {
                from: 'alice',
                to: 'bob',
                edgeType: 'knows',
                newWeight: 0.8
            };

            const result = await manager.updateEdges([update]);

            expect(result).toHaveLength(1);
            expect(result[0].weight).toBe(0.8);
        });

        it('should update edge endpoints', async () => {
            const update: EdgeUpdate = {
                from: 'alice',
                to: 'bob',
                edgeType: 'knows',
                newTo: 'carol'
            };

            const result = await manager.updateEdges([update]);

            expect(result[0].to).toBe('carol');
        });

        it('should fail when updating non-existent edge', async () => {
            const update: EdgeUpdate = {
                from: 'alice',
                to: 'carol',
                edgeType: 'nonexistent',
                newWeight: 0.5
            };

            await expect(manager.updateEdges([update])).rejects.toThrow('Edge not found');
        });

        it('should emit beforeUpdateEdges and afterUpdateEdges events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const update: EdgeUpdate = {
                from: 'alice',
                to: 'bob',
                edgeType: 'knows',
                newWeight: 0.9
            };

            await manager.updateEdges([update]);

            expect(emitSpy).toHaveBeenCalledWith('beforeUpdateEdges', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterUpdateEdges', expect.any(Object));
        });

        it('should validate weight values', async () => {
            const update: EdgeUpdate = {
                from: 'alice',
                to: 'bob',
                edgeType: 'knows',
                newWeight: 1.5  // Invalid weight > 1
            };

            await expect(manager.updateEdges([update])).rejects.toThrow();
        });
    });

    describe('deleteEdges()', () => {
        it('should delete existing edge', async () => {
            const edgeToDelete: Edge = {
                type: 'edge',
                from: 'alice',
                to: 'bob',
                edgeType: 'knows'
            };

            await manager.deleteEdges([edgeToDelete]);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            expect(saveCall.edges).toHaveLength(0);
        });

        it('should delete multiple edges', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'bob', to: 'carol', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'alice', to: 'carol', edgeType: 'mentors' }
                ]
            });

            const edgesToDelete = [
                { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                { type: 'edge' as const, from: 'bob', to: 'carol', edgeType: 'knows' }
            ];

            await manager.deleteEdges(edgesToDelete);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            expect(saveCall.edges).toHaveLength(1);
        });

        it('should emit beforeDeleteEdges and afterDeleteEdges events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const edgeToDelete: Edge = {
                type: 'edge',
                from: 'alice',
                to: 'bob',
                edgeType: 'knows'
            };

            await manager.deleteEdges([edgeToDelete]);

            expect(emitSpy).toHaveBeenCalledWith('beforeDeleteEdges', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterDeleteEdges', expect.any(Object));
        });

        it('should handle deleting non-existent edge', async () => {
            const nonExistentEdge: Edge = {
                type: 'edge',
                from: 'alice',
                to: 'carol',
                edgeType: 'nonexistent'
            };

            await expect(() => manager.deleteEdges([nonExistentEdge])).not.toThrow();
        });

        it('should handle empty delete list', async () => {
            await manager.deleteEdges([]);

            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });

    describe('getEdges()', () => {
        it('should retrieve all edges without filter', async () => {
            const result = await manager.getEdges();

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(sampleEdge);
        });

        it('should filter edges by from node', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'bob', to: 'carol', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'alice', to: 'carol', edgeType: 'mentors' }
                ]
            });

            const filter: EdgeFilter = { from: 'alice' };
            const result = await manager.getEdges(filter);

            expect(result).toHaveLength(2);
            expect(result.every(e => e.from === 'alice')).toBe(true);
        });

        it('should filter edges by to node', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'carol', to: 'bob', edgeType: 'knows' }
                ]
            });

            const filter: EdgeFilter = { to: 'bob' };
            const result = await manager.getEdges(filter);

            expect(result).toHaveLength(2);
            expect(result.every(e => e.to === 'bob')).toBe(true);
        });

        it('should filter edges by type', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'alice', to: 'carol', edgeType: 'mentors' }
                ]
            });

            const filter: EdgeFilter = { edgeType: 'knows' };
            const result = await manager.getEdges(filter);

            expect(result).toHaveLength(1);
            expect(result[0].edgeType).toBe('knows');
        });

        it('should apply multiple filter criteria', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'alice', to: 'carol', edgeType: 'knows' },
                    { type: 'edge' as const, from: 'bob', to: 'carol', edgeType: 'mentors' }
                ]
            });

            const filter: EdgeFilter = { from: 'alice', edgeType: 'knows' };
            const result = await manager.getEdges(filter);

            expect(result).toHaveLength(2);
            expect(result.every(e => e.from === 'alice' && e.edgeType === 'knows')).toBe(true);
        });

        it('should return empty array for no matches', async () => {
            const filter: EdgeFilter = { from: 'nonexistent' };
            const result = await manager.getEdges(filter);

            expect(result).toHaveLength(0);
        });
    });

    describe('Error handling', () => {
        it('should handle storage load errors', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            const newEdge: Edge = {
                type: 'edge',
                from: 'alice',
                to: 'bob',
                edgeType: 'knows'
            };

            await expect(manager.addEdges([newEdge])).rejects.toThrow();
        });

        it('should handle storage save errors', async () => {
            mockStorage.saveGraph = vi.fn().mockRejectedValue(new Error('Save error'));

            const newEdge: Edge = {
                type: 'edge',
                from: 'bob',
                to: 'carol',
                edgeType: 'knows'
            };

            await expect(manager.addEdges([newEdge])).rejects.toThrow();
        });

        it('should handle non-Error exceptions', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue('string error');

            await expect(manager.getEdges()).rejects.toThrow();
        });
    });

    describe('Integration', () => {
        it('should handle add-update-delete workflow', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: []
            });

            // Add edge
            const newEdge: Edge = {
                type: 'edge',
                from: 'alice',
                to: 'bob',
                edgeType: 'knows'
            };

            await manager.addEdges([newEdge]);

            // Update edge
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [newEdge]
            });

            const update: EdgeUpdate = {
                from: 'alice',
                to: 'bob',
                edgeType: 'knows',
                newWeight: 0.9
            };

            const updated = await manager.updateEdges([update]);
            expect(updated[0].weight).toBe(0.9);

            // Delete edge
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: sampleNodes,
                edges: [{ ...newEdge, weight: 0.9 }]
            });

            await manager.deleteEdges([newEdge]);
            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });
});
