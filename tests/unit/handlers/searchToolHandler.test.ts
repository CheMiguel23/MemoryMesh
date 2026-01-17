import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchToolHandler } from '../../../src/integration/tools/handlers/SearchToolHandler.js';
import type { ApplicationManager } from '../../../src/application/managers/ApplicationManager.js';
import type { Graph } from '../../../src/core/graph/index.js';

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

describe('SearchToolHandler', () => {
    let handler: SearchToolHandler;
    let mockManager: ApplicationManager;

    beforeEach(() => {
        mockManager = createMockApplicationManager();
        handler = new SearchToolHandler(mockManager);
    });

    describe('read_graph', () => {
        it('should return entire graph successfully', async () => {
            const mockGraph: Graph = {
                nodes: [
                    { type: 'node', name: 'node1', nodeType: 'npc', metadata: ['info'] }
                ],
                edges: [
                    { type: 'edge', from: 'node1', to: 'node2', edgeType: 'knows' }
                ]
            };
            vi.mocked(mockManager.readGraph).mockResolvedValue(mockGraph);

            const result = await handler.handleTool('read_graph', {});

            expect(mockManager.readGraph).toHaveBeenCalled();
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data).toEqual(mockGraph);
            expect(result.structuredContent?.actionTaken).toContain('Read complete knowledge graph');
        });

        it('should handle empty graph', async () => {
            const emptyGraph: Graph = { nodes: [], edges: [] };
            vi.mocked(mockManager.readGraph).mockResolvedValue(emptyGraph);

            const result = await handler.handleTool('read_graph', {});

            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data.nodes).toHaveLength(0);
            expect(result.structuredContent?.data.edges).toHaveLength(0);
        });

        it('should handle read errors', async () => {
            vi.mocked(mockManager.readGraph).mockRejectedValue(new Error('Storage error'));

            const result = await handler.handleTool('read_graph', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Storage error');
        });
    });

    describe('search_nodes', () => {
        it('should search nodes with query', async () => {
            const searchResult = {
                nodes: [
                    { type: 'node' as const, name: 'dragon', nodeType: 'creature', metadata: ['Fire breathing'] }
                ],
                edges: []
            };
            vi.mocked(mockManager.searchNodes).mockResolvedValue(searchResult);

            const result = await handler.handleTool('search_nodes', { query: 'dragon' });

            expect(mockManager.searchNodes).toHaveBeenCalledWith('dragon');
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data).toEqual(searchResult);
            expect(result.structuredContent?.actionTaken).toContain('dragon');
        });

        it('should handle empty search results', async () => {
            vi.mocked(mockManager.searchNodes).mockResolvedValue({ nodes: [], edges: [] });

            const result = await handler.handleTool('search_nodes', { query: 'nonexistent' });

            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data.nodes).toHaveLength(0);
        });

        it('should handle search errors', async () => {
            vi.mocked(mockManager.searchNodes).mockRejectedValue(new Error('Search failed'));

            const result = await handler.handleTool('search_nodes', { query: 'test' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Search failed');
        });
    });

    describe('open_nodes', () => {
        it('should open specific nodes by name', async () => {
            const openResult = {
                nodes: [
                    { type: 'node' as const, name: 'hero', nodeType: 'npc', metadata: ['Brave'] },
                    { type: 'node' as const, name: 'village', nodeType: 'location', metadata: ['Peaceful'] }
                ],
                edges: [
                    { type: 'edge' as const, from: 'hero', to: 'village', edgeType: 'lives_in' }
                ]
            };
            vi.mocked(mockManager.openNodes).mockResolvedValue(openResult);

            const result = await handler.handleTool('open_nodes', { names: ['hero', 'village'] });

            expect(mockManager.openNodes).toHaveBeenCalledWith(['hero', 'village']);
            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data).toEqual(openResult);
            expect(result.structuredContent?.actionTaken).toContain('hero');
            expect(result.structuredContent?.actionTaken).toContain('village');
        });

        it('should handle single node', async () => {
            const openResult = {
                nodes: [
                    { type: 'node' as const, name: 'castle', nodeType: 'location', metadata: ['Grand'] }
                ],
                edges: []
            };
            vi.mocked(mockManager.openNodes).mockResolvedValue(openResult);

            const result = await handler.handleTool('open_nodes', { names: ['castle'] });

            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data.nodes).toHaveLength(1);
        });

        it('should handle non-existent nodes gracefully', async () => {
            vi.mocked(mockManager.openNodes).mockResolvedValue({ nodes: [], edges: [] });

            const result = await handler.handleTool('open_nodes', { names: ['nonexistent'] });

            expect(result.isError).toBe(false);
            expect(result.structuredContent?.data.nodes).toHaveLength(0);
        });

        it('should handle open errors', async () => {
            vi.mocked(mockManager.openNodes).mockRejectedValue(new Error('Node access denied'));

            const result = await handler.handleTool('open_nodes', { names: ['secret'] });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Node access denied');
        });
    });

    describe('unknown operation', () => {
        it('should throw error for unknown tool name', async () => {
            const result = await handler.handleTool('unknown_search_tool', { query: 'test' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown search operation');
        });
    });

    describe('error response format', () => {
        it('should include suggestions in error response', async () => {
            vi.mocked(mockManager.searchNodes).mockRejectedValue(new Error('Failed'));

            const result = await handler.handleTool('search_nodes', { query: 'test' });

            expect(result.structuredContent?.suggestions).toBeDefined();
            expect(result.structuredContent?.suggestions?.length).toBeGreaterThan(0);
        });

        it('should include recovery steps in error response', async () => {
            vi.mocked(mockManager.openNodes).mockRejectedValue(new Error('Failed'));

            const result = await handler.handleTool('open_nodes', { names: ['test'] });

            expect(result.structuredContent?.recoverySteps).toBeDefined();
        });

        it('should include context in error response', async () => {
            vi.mocked(mockManager.searchNodes).mockRejectedValue(new Error('Failed'));

            const result = await handler.handleTool('search_nodes', { query: 'dragon' });

            // The error formatter includes args in context
            expect(result.content.some(c => c.text.includes('dragon') || c.text.includes('args'))).toBe(true);
        });
    });
});
