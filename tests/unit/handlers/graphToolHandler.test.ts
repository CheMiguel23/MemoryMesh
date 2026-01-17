import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphToolHandler } from '../../../src/integration/tools/handlers/GraphToolHandler.js';
import type { ApplicationManager } from '../../../src/application/managers/ApplicationManager.js';
import type { Node, Edge } from '../../../src/core/graph/index.js';

// Mock ApplicationManager
const createMockApplicationManager = (): ApplicationManager => ({
    addNodes: vi.fn(),
    updateNodes: vi.fn(),
    deleteNodes: vi.fn(),
    addEdges: vi.fn(),
    updateEdges: vi.fn(),
    deleteEdges: vi.fn(),
    getEdges: vi.fn(),
    addMetadata: vi.fn(),
    deleteMetadata: vi.fn(),
    readGraph: vi.fn(),
    searchNodes: vi.fn(),
    openNodes: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    withTransaction: vi.fn(),
    addRollbackAction: vi.fn(),
    isInTransaction: vi.fn(),
    getCurrentGraph: vi.fn(),
} as unknown as ApplicationManager);

describe('GraphToolHandler', () => {
    let handler: GraphToolHandler;
    let mockManager: ApplicationManager;

    beforeEach(() => {
        mockManager = createMockApplicationManager();
        handler = new GraphToolHandler(mockManager);
    });

    describe('add_nodes', () => {
        it('should add nodes successfully', async () => {
            const nodes: Node[] = [
                { type: 'node', name: 'test', nodeType: 'npc', metadata: ['info'] }
            ];
            vi.mocked(mockManager.addNodes).mockResolvedValue(nodes);

            const result = await handler.handleTool('add_nodes', { nodes });

            expect(mockManager.addNodes).toHaveBeenCalledWith(nodes);
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data?.nodes).toEqual(nodes);
            expect(result.structuredContent?.actionTaken).toContain('Added nodes');
        });

        it('should return error when addNodes fails', async () => {
            vi.mocked(mockManager.addNodes).mockRejectedValue(new Error('Database error'));

            const result = await handler.handleTool('add_nodes', {
                nodes: [{ name: 'test', nodeType: 'npc', metadata: [] }]
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Database error');
        });
    });

    describe('update_nodes', () => {
        it('should update nodes successfully', async () => {
            const nodes: Node[] = [
                { type: 'node', name: 'test', nodeType: 'npc', metadata: ['updated'] }
            ];
            vi.mocked(mockManager.updateNodes).mockResolvedValue(nodes);

            const result = await handler.handleTool('update_nodes', {
                nodes: [{ name: 'test', metadata: ['updated'] }]
            });

            expect(mockManager.updateNodes).toHaveBeenCalled();
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.actionTaken).toContain('Updated nodes');
        });
    });

    describe('add_edges', () => {
        it('should add edges successfully', async () => {
            const edges: Edge[] = [
                { type: 'edge', from: 'a', to: 'b', edgeType: 'knows' }
            ];
            vi.mocked(mockManager.addEdges).mockResolvedValue(edges);

            const result = await handler.handleTool('add_edges', { edges });

            expect(mockManager.addEdges).toHaveBeenCalledWith(edges);
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data?.edges).toEqual(edges);
        });

        it('should handle edges with weight', async () => {
            const edges: Edge[] = [
                { type: 'edge', from: 'a', to: 'b', edgeType: 'knows', weight: 0.8 }
            ];
            vi.mocked(mockManager.addEdges).mockResolvedValue(edges);

            const result = await handler.handleTool('add_edges', { edges });

            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data?.edges[0].weight).toBe(0.8);
        });
    });

    describe('update_edges', () => {
        it('should update edges successfully', async () => {
            const edges: Edge[] = [
                { type: 'edge', from: 'a', to: 'b', edgeType: 'friends' }
            ];
            vi.mocked(mockManager.updateEdges).mockResolvedValue(edges);

            const result = await handler.handleTool('update_edges', {
                edges: [{ from: 'a', to: 'b', edgeType: 'knows', newEdgeType: 'friends' }]
            });

            expect(mockManager.updateEdges).toHaveBeenCalled();
            expect(result.isError).toBe(false);
        });
    });

    describe('delete_nodes', () => {
        it('should delete nodes successfully', async () => {
            vi.mocked(mockManager.deleteNodes).mockResolvedValue(undefined);

            const result = await handler.handleTool('delete_nodes', {
                nodeNames: ['node1', 'node2']
            });

            expect(mockManager.deleteNodes).toHaveBeenCalledWith(['node1', 'node2']);
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.actionTaken).toContain('node1');
            expect(result.structuredContent?.actionTaken).toContain('node2');
        });
    });

    describe('delete_edges', () => {
        it('should delete edges successfully', async () => {
            vi.mocked(mockManager.deleteEdges).mockResolvedValue(undefined);

            const edges = [{ from: 'a', to: 'b', edgeType: 'knows' }];
            const result = await handler.handleTool('delete_edges', { edges });

            expect(mockManager.deleteEdges).toHaveBeenCalledWith(edges);
            expect(result.isError).toBe(false);
        });
    });

    describe('unknown operation', () => {
        it('should throw error for unknown tool name', async () => {
            const result = await handler.handleTool('unknown_tool', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown graph operation');
        });
    });

    describe('argument validation', () => {
        it('should handle null arguments', async () => {
            const result = await handler.handleTool('add_nodes', null as any);

            expect(result.isError).toBe(true);
        });

        it('should handle undefined arguments', async () => {
            const result = await handler.handleTool('add_nodes', undefined as any);

            expect(result.isError).toBe(true);
        });
    });

    describe('error response format', () => {
        it('should include suggestions in error response', async () => {
            vi.mocked(mockManager.addNodes).mockRejectedValue(new Error('Failed'));

            const result = await handler.handleTool('add_nodes', { nodes: [] });

            expect(result.structuredContent?.suggestions).toBeDefined();
            expect(Array.isArray(result.structuredContent?.suggestions)).toBe(true);
        });

        it('should include recovery steps in error response', async () => {
            vi.mocked(mockManager.addNodes).mockRejectedValue(new Error('Failed'));

            const result = await handler.handleTool('add_nodes', { nodes: [] });

            expect(result.structuredContent?.recoverySteps).toBeDefined();
            expect(Array.isArray(result.structuredContent?.recoverySteps)).toBe(true);
        });
    });
});
