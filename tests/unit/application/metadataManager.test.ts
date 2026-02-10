import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataManager } from '../../../src/application/managers/MetadataManager.js';
import type { Graph, Node } from '../../../src/core/index.js';
import type { IStorage } from '../../../src/infrastructure/index.js';
import type { MetadataAddition, MetadataDeletion } from '../../../src/core/index.js';

describe('MetadataManager', () => {
    let manager: MetadataManager;
    let mockStorage: IStorage;

    const sampleNode: Node = {
        type: 'node',
        name: 'alice',
        nodeType: 'character',
        metadata: ['brave', 'hero']
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

        manager = new MetadataManager(mockStorage);
    });

    describe('addMetadata()', () => {
        it('should add metadata to existing node', async () => {
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['smart']
            };

            const result = await manager.addMetadata([addition]);

            expect(result).toHaveLength(1);
            expect(result[0].addedMetadata).toContain('smart');
        });

        it('should add multiple metadata items to node', async () => {
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['smart', 'kind', 'strong']
            };

            const result = await manager.addMetadata([addition]);

            expect(result[0].addedMetadata).toHaveLength(3);
        });

        it('should prevent duplicate metadata', async () => {
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['brave', 'new-tag']  // 'brave' already exists
            };

            const result = await manager.addMetadata([addition]);

            expect(result[0].addedMetadata).toHaveLength(1);
            expect(result[0].addedMetadata).toContain('new-tag');
            expect(result[0].addedMetadata).not.toContain('brave');
        });

        it('should add metadata to multiple nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            const additions: MetadataAddition[] = [
                { nodeName: 'alice', contents: ['tag1'] },
                { nodeName: 'bob', contents: ['tag2'] }
            ];

            const result = await manager.addMetadata(additions);

            expect(result).toHaveLength(2);
        });

        it('should fail when adding to non-existent node', async () => {
            const addition: MetadataAddition = {
                nodeName: 'nonexistent',
                contents: ['tag']
            };

            await expect(manager.addMetadata([addition])).rejects.toThrow();
        });

        it('should emit beforeAddMetadata and afterAddMetadata events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['tag']
            };

            await manager.addMetadata([addition]);

            expect(emitSpy).toHaveBeenCalledWith('beforeAddMetadata', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterAddMetadata', expect.any(Object));
        });

        it('should handle empty metadata list', async () => {
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: []
            };

            const result = await manager.addMetadata([addition]);

            expect(result[0].addedMetadata).toHaveLength(0);
        });
    });

    describe('deleteMetadata()', () => {
        it('should delete metadata from node', async () => {
            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['brave']
            };

            await manager.deleteMetadata([deletion]);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            const node = saveCall.nodes.find((n: Node) => n.name === 'alice');
            expect(node.metadata).not.toContain('brave');
            expect(node.metadata).toContain('hero');
        });

        it('should delete multiple metadata items from node', async () => {
            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['brave', 'hero']
            };

            await manager.deleteMetadata([deletion]);

            const saveCall = (mockStorage.saveGraph as any).mock.calls[0][0];
            const node = saveCall.nodes.find((n: Node) => n.name === 'alice');
            expect(node.metadata).toHaveLength(0);
        });

        it('should delete metadata from multiple nodes', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'alice', nodeType: 'character', metadata: ['tag1', 'tag2'] },
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: ['tag1', 'tag3'] }
                ],
                edges: []
            });

            const deletions: MetadataDeletion[] = [
                { nodeName: 'alice', metadata: ['tag1'] },
                { nodeName: 'bob', metadata: ['tag1'] }
            ];

            await manager.deleteMetadata(deletions);

            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });

        it('should fail when deleting from non-existent node', async () => {
            const deletion: MetadataDeletion = {
                nodeName: 'nonexistent',
                metadata: ['tag']
            };

            await expect(manager.deleteMetadata([deletion])).rejects.toThrow();
        });

        it('should handle deleting non-existent metadata', async () => {
            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['nonexistent-tag']
            };

            await expect(() => manager.deleteMetadata([deletion])).not.toThrow();
        });

        it('should emit beforeDeleteMetadata and afterDeleteMetadata events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');
            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['brave']
            };

            await manager.deleteMetadata([deletion]);

            expect(emitSpy).toHaveBeenCalledWith('beforeDeleteMetadata', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterDeleteMetadata', expect.any(Object));
        });

        it('should handle empty delete list', async () => {
            await manager.deleteMetadata([]);

            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });

    describe('getMetadata()', () => {
        it('should retrieve metadata for node', async () => {
            const result = await manager.getMetadata('alice');

            expect(result).toContain('brave');
            expect(result).toContain('hero');
        });

        it('should return empty array for node with no metadata', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node' as const, name: 'bob', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            const result = await manager.getMetadata('bob');

            expect(result).toHaveLength(0);
        });

        it('should fail when getting metadata for non-existent node', async () => {
            await expect(manager.getMetadata('nonexistent')).rejects.toThrow();
        });

        it('should return actual metadata array', async () => {
            const result = await manager.getMetadata('alice');

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(2);
        });
    });

    describe('Error handling', () => {
        it('should handle storage load errors in addMetadata', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['tag']
            };

            await expect(manager.addMetadata([addition])).rejects.toThrow();
        });

        it('should handle storage load errors in deleteMetadata', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['tag']
            };

            await expect(manager.deleteMetadata([deletion])).rejects.toThrow();
        });

        it('should handle storage load errors in getMetadata', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            await expect(manager.getMetadata('alice')).rejects.toThrow();
        });

        it('should handle storage save errors', async () => {
            mockStorage.saveGraph = vi.fn().mockRejectedValue(new Error('Save error'));

            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['tag']
            };

            await expect(manager.addMetadata([addition])).rejects.toThrow();
        });

        it('should handle non-Error exceptions', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue('string error');

            await expect(manager.getMetadata('alice')).rejects.toThrow();
        });
    });

    describe('Integration', () => {
        it('should handle add-delete workflow', async () => {
            // Add
            const addition: MetadataAddition = {
                nodeName: 'alice',
                contents: ['smart']
            };

            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [sampleNode],
                edges: []
            });

            await manager.addMetadata([addition]);

            // Delete
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [{ ...sampleNode, metadata: [...sampleNode.metadata, 'smart'] }],
                edges: []
            });

            const deletion: MetadataDeletion = {
                nodeName: 'alice',
                metadata: ['smart']
            };

            await manager.deleteMetadata([deletion]);
            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });

        it('should handle multiple operations on same node', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [{ ...sampleNode, metadata: ['tag1'] }],
                edges: []
            });

            // Add multiple tags
            const additions: MetadataAddition[] = [
                { nodeName: 'alice', contents: ['tag2', 'tag3'] }
            ];

            const addResult = await manager.addMetadata(additions);
            expect(addResult).toHaveLength(1);

            // Delete one tag
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [{ ...sampleNode, metadata: ['tag1', 'tag2', 'tag3'] }],
                edges: []
            });

            const deletions: MetadataDeletion[] = [
                { nodeName: 'alice', metadata: ['tag2'] }
            ];

            await manager.deleteMetadata(deletions);
            expect(mockStorage.saveGraph).toHaveBeenCalled();
        });
    });
});
