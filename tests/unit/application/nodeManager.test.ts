import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeManager } from '../../../src/application/managers/NodeManager.js';
import type { Node, Graph } from '../../../src/core/index.js';
import type { IStorage } from '../../../src/infrastructure/index.js';

describe('NodeManager', () => {
    let manager: NodeManager;
    let mockStorage: IStorage;

    const sampleNode: Node = {
        type: 'node',
        name: 'alice',
        nodeType: 'character',
        metadata: ['protagonist']
    };

    const sampleGraph: Graph = {
        nodes: [sampleNode],
        edges: []
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorage = {
            loadGraph: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(sampleGraph))),
            saveGraph: vi.fn().mockResolvedValue(undefined)
        } as unknown as IStorage;

        manager = new NodeManager(mockStorage);
    });

    describe('addNodes()', () => {
        it('should add valid node', async () => {
            const newNode: Node = {
                type: 'node',
                name: 'bob',
                nodeType: 'character',
                metadata: ['sidekick']
            };

            const result = await manager.addNodes([newNode]);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('bob');
            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });

        it('should add multiple nodes', async () => {
            const newNodes = [
                { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] },
                { type: 'node' as const, name: 'carol', nodeType: 'character', metadata: [] }
            ];

            const result = await manager.addNodes(newNodes);

            expect(result).toHaveLength(2);
        });

        it('should emit beforeAddNodes and afterAddNodes events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const newNode: Node = {
                type: 'node',
                name: 'bob',
                nodeType: 'character',
                metadata: []
            };

            await manager.addNodes([newNode]);

            expect(emitSpy).toHaveBeenCalledWith('beforeAddNodes', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterAddNodes', expect.any(Object));
        });

        it('should validate node before adding', async () => {
            const invalidNode = { name: 'test' } as any;

            await expect(manager.addNodes([invalidNode])).rejects.toThrow();
        });
    });

    describe('updateNodes()', () => {
        it('should update existing node', async () => {
            const update = { name: 'alice', metadata: ['updated'] };

            const result = await manager.updateNodes([update as any]);

            expect(result).toHaveLength(1);
            expect(result[0].metadata).toContain('updated');
        });

        it('should update multiple nodes', async () => {
            // Setup graph with multiple nodes
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            const updates = [
                { name: 'alice', metadata: ['updated1'] },
                { name: 'bob', metadata: ['updated2'] }
            ];

            const result = await manager.updateNodes(updates as any);

            expect(result).toHaveLength(2);
        });

        it('should fail when updating non-existent node', async () => {
            const update = { name: 'nonexistent', metadata: [] };

            await expect(manager.updateNodes([update as any])).rejects.toThrow('Node not found');
        });

        it('should emit beforeUpdateNodes and afterUpdateNodes events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const update = { name: 'alice', metadata: ['updated'] };

            await manager.updateNodes([update as any]);

            expect(emitSpy).toHaveBeenCalledWith('beforeUpdateNodes', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterUpdateNodes', expect.any(Object));
        });
    });

    describe('deleteNodes()', () => {
        it('should delete existing node', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [{ type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] }],
                edges: []
            });

            await manager.deleteNodes(['alice']);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            expect(saveCall.nodes).toHaveLength(0);
        });

        it('should delete multiple nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'carol', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            await manager.deleteNodes(['alice', 'bob']);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            expect(saveCall.nodes).toHaveLength(1);
            expect(saveCall.nodes[0].name).toBe('carol');
        });

        it('should remove associated edges when deleting nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] }
                ],
                edges: [
                    { type: 'edge' as const, from: 'alice', to: 'bob', edgeType: 'knows' }
                ]
            });

            await manager.deleteNodes(['alice']);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            expect(saveCall.edges).toHaveLength(0);
        });

        it('should emit beforeDeleteNodes and afterDeleteNodes events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.deleteNodes(['alice']);

            expect(emitSpy).toHaveBeenCalledWith('beforeDeleteNodes', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterDeleteNodes', expect.any(Object));
        });

        it('should handle empty delete list', async () => {
            await manager.deleteNodes([]);

            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });

    describe('getNodes()', () => {
        it('should retrieve single node', async () => {
            const result = await manager.getNodes(['alice']);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('alice');
        });

        it('should retrieve multiple nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'carol', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            const result = await manager.getNodes(['alice', 'carol']);

            expect(result).toHaveLength(2);
            expect(result.map(n => n.name)).toContain('alice');
            expect(result.map(n => n.name)).toContain('carol');
        });

        it('should return empty array for non-existent nodes', async () => {
            const result = await manager.getNodes(['nonexistent']);

            expect(result).toHaveLength(0);
        });

        it('should handle mixed existent and non-existent nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [{ type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] }],
                edges: []
            });

            const result = await manager.getNodes(['alice', 'nonexistent']);

            expect(result).toHaveLength(1);
        });
    });

    describe('Error handling', () => {
        it('should handle storage load errors', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            await expect(manager.addNodes([sampleNode])).rejects.toThrow();
        });

        it('should handle storage save errors', async () => {
            mockStorage.saveGraph = vi.fn().mockRejectedValue(new Error('Save error'));

            await expect(manager.addNodes([{ type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] }])).rejects.toThrow();
        });

        it('should handle non-Error exceptions', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue('string error');

            await expect(manager.getNodes(['test'])).rejects.toThrow();
        });
    });

    describe('Integration', () => {
        it('should handle add-update-delete workflow', async () => {
            // Add
            const newNode: Node = {
                type: 'node',
                name: 'bob',
                nodeType: 'character',
                metadata: []
            };
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [sampleNode],
                edges: []
            });

            await manager.addNodes([newNode]);

            // Update
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [sampleNode, newNode],
                edges: []
            });

            const updated = await manager.updateNodes([{ name: 'bob', metadata: ['updated'] } as any]);
            expect(updated[0].metadata).toContain('updated');

            // Delete
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [sampleNode, { ...newNode, metadata: ['updated'] }],
                edges: []
            });

            await manager.deleteNodes(['bob']);
            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });
});
