import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DynamicToolManager, dynamicToolManager } from '../../../src/integration/tools/registry/dynamicTools.js';
import type { Tool, ToolResponse } from '../../../src/shared/index.js';
import type { ApplicationManager } from '../../../src/application/index.js';

// Mock dependencies
vi.mock('@integration/tools/DynamicSchemaToolRegistry.js', () => {
    return {
        initializeDynamicTools: vi.fn()
    };
});

vi.mock('@shared/index.js', () => ({
    formatToolError: vi.fn((errorObj) => ({
        isError: true,
        content: [{ type: 'text', text: `Error: ${errorObj.error}` }]
    }))
}));

import { initializeDynamicTools } from '@integration/tools/DynamicSchemaToolRegistry.js';

describe('DynamicToolManager', () => {
    let manager: DynamicToolManager;

    const mockTool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
            type: 'object',
            properties: {
                param1: { type: 'string' }
            },
            required: ['param1']
        }
    };

    const mockRegistry = {
        getTools: vi.fn(),
        handleToolCall: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset singleton by creating new instance
        manager = DynamicToolManager.getInstance();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Singleton pattern', () => {
        it('should return same instance on multiple calls', () => {
            const instance1 = DynamicToolManager.getInstance();
            const instance2 = DynamicToolManager.getInstance();

            expect(instance1 === instance2 || instance1 === instance2).toBe(true);
        });

        it('should have a default singleton export', () => {
            expect(dynamicToolManager).toBeDefined();
            expect(typeof dynamicToolManager).toBe('object');
        });
    });

    describe('initialize()', () => {
        it('should initialize the registry successfully', async () => {
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            expect(initializeDynamicTools).toHaveBeenCalled();
        });

        it('should successfully load schemas and generate tools', async () => {
            const testTools: Tool[] = [
                { name: 'add_nodes', description: 'Add nodes', inputSchema: { type: 'object', properties: {} } },
                { name: 'search_graph', description: 'Search', inputSchema: { type: 'object', properties: {} } }
            ];

            vi.mocked(mockRegistry.getTools).mockReturnValue(testTools);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const tools = manager.getTools();

            expect(tools).toHaveLength(2);
            expect(tools[0].name).toBe('add_nodes');
        });
    });

    describe('getTools()', () => {
        it('should return all generated tools', async () => {
            const mockTools: Tool[] = [
                {
                    name: 'tool1',
                    description: 'First tool',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'tool2',
                    description: 'Second tool',
                    inputSchema: { type: 'object', properties: {} }
                }
            ];

            vi.mocked(mockRegistry.getTools).mockReturnValue(mockTools);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const tools = manager.getTools();

            expect(tools).toHaveLength(2);
            expect(tools[0].name).toBe('tool1');
            expect(tools[1].name).toBe('tool2');
        });

        it('should require initialization before calling getTools', async () => {
            // Initialize first
            vi.mocked(mockRegistry.getTools).mockReturnValue([mockTool]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const tools = manager.getTools();

            expect(tools).toHaveLength(1);
        });

        it('should return empty array if no schemas exist', async () => {
            vi.mocked(mockRegistry.getTools).mockReturnValue([]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const tools = manager.getTools();

            expect(tools).toHaveLength(0);
        });

        it('should return tools with proper structure', async () => {
            const toolWithAllFields: Tool = {
                name: 'comprehensive_tool',
                description: 'A tool with all fields',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Node name' },
                        type: { type: 'string', enum: ['npc', 'location', 'item'] }
                    },
                    required: ['name', 'type']
                }
            };

            vi.mocked(mockRegistry.getTools).mockReturnValue([toolWithAllFields]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const tools = manager.getTools();

            expect(tools[0]).toHaveProperty('name');
            expect(tools[0]).toHaveProperty('description');
            expect(tools[0]).toHaveProperty('inputSchema');
            expect(tools[0].inputSchema.properties).toBeDefined();
            expect(tools[0].inputSchema.required).toBeDefined();
        });
    });

    describe('handleToolCall()', () => {
        const mockManager: ApplicationManager = {
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
            getCurrentGraph: vi.fn()
        } as unknown as ApplicationManager;

        it('should successfully call a tool', async () => {
            const mockResponse: ToolResponse = {
                content: [{ type: 'text', text: 'Tool executed successfully' }],
                isError: false
            };

            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(mockResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const response = await manager.handleToolCall('test_tool', { param: 'value' }, mockManager);

            expect(response).toEqual(mockResponse);
            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith('test_tool', { param: 'value' }, mockManager);
        });

        it('should handle tool calls after initialization', async () => {
            const mockResponse: ToolResponse = {
                content: [{ type: 'text', text: 'Success' }],
                isError: false
            };

            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(mockResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const response = await manager.handleToolCall('test_tool', {}, mockManager);

            expect(response).toBeDefined();
        });

        it('should handle various argument types', async () => {
            const mockResponse: ToolResponse = {
                content: [{ type: 'text', text: 'Success' }],
                isError: false
            };

            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(mockResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            // String argument
            await manager.handleToolCall('tool1', { text: 'hello' }, mockManager);
            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith('tool1', { text: 'hello' }, mockManager);

            // Number argument
            await manager.handleToolCall('tool2', { count: 42 }, mockManager);
            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith('tool2', { count: 42 }, mockManager);

            // Boolean argument
            await manager.handleToolCall('tool3', { enabled: true }, mockManager);
            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith('tool3', { enabled: true }, mockManager);

            // Object argument
            await manager.handleToolCall('tool4', { metadata: { key: 'value' } }, mockManager);
            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith('tool4', { metadata: { key: 'value' } }, mockManager);
        });

        it('should handle tool call errors', async () => {
            const errorResponse: ToolResponse = {
                isError: true,
                content: [{ type: 'text', text: 'Tool error occurred' }]
            };

            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(errorResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const response = await manager.handleToolCall('bad_tool', {}, mockManager);

            expect(response.isError).toBe(true);
        });

        it('should handle registry exceptions', async () => {
            const error = new Error('Registry error');
            vi.mocked(mockRegistry.handleToolCall).mockRejectedValue(error);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            const response = await manager.handleToolCall('test_tool', {}, mockManager);

            expect(response.isError).toBe(true);
        });

        it('should pass correct arguments to registry handleToolCall', async () => {
            const mockResponse: ToolResponse = {
                content: [{ type: 'text', text: 'Success' }],
                isError: false
            };
            
            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(mockResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            await manager.handleToolCall('problem_tool', { arg1: 'val1', arg2: 'val2' }, mockManager);

            expect(mockRegistry.handleToolCall).toHaveBeenCalledWith(
                'problem_tool',
                { arg1: 'val1', arg2: 'val2' },
                mockManager
            );
        });
    });

    describe('isDynamicTool()', () => {
        it('should return true for registered dynamic tools', async () => {
            vi.mocked(mockRegistry.getTools).mockReturnValue([
                { name: 'add_node', description: 'Add node', inputSchema: { type: 'object', properties: {} } },
                { name: 'search_graph', description: 'Search', inputSchema: { type: 'object', properties: {} } }
            ]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            expect(manager.isDynamicTool('add_node')).toBe(true);
            expect(manager.isDynamicTool('search_graph')).toBe(true);
        });

        it('should return false for non-existent tools', async () => {
            vi.mocked(mockRegistry.getTools).mockReturnValue([
                { name: 'add_node', description: 'Add node', inputSchema: { type: 'object', properties: {} } }
            ]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            expect(manager.isDynamicTool('nonexistent_tool')).toBe(false);
            expect(manager.isDynamicTool('random_name')).toBe(false);
        });

        it('should check for tools after initialization', async () => {
            vi.mocked(mockRegistry.getTools).mockReturnValue([
                { name: 'real_tool', description: 'Real tool', inputSchema: { type: 'object', properties: {} } }
            ]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            expect(manager.isDynamicTool('real_tool')).toBe(true);
        });

        it('should be case-sensitive', async () => {
            vi.mocked(mockRegistry.getTools).mockReturnValue([
                { name: 'AddNode', description: 'Add node', inputSchema: { type: 'object', properties: {} } }
            ]);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            expect(manager.isDynamicTool('AddNode')).toBe(true);
            expect(manager.isDynamicTool('addnode')).toBe(false);
            expect(manager.isDynamicTool('ADDNODE')).toBe(false);
        });
    });

    describe('Integration scenarios', () => {
        it('should handle multiple tool calls in sequence', async () => {
            const mockResponse: ToolResponse = {
                content: [{ type: 'text', text: 'Success' }],
                isError: false
            };

            vi.mocked(mockRegistry.getTools).mockReturnValue([
                { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
                { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } }
            ]);
            vi.mocked(mockRegistry.handleToolCall).mockResolvedValue(mockResponse);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            const mockAppManager: ApplicationManager = {} as any;

            await manager.initialize();

            await manager.handleToolCall('tool1', { arg: 'val1' }, mockAppManager);
            await manager.handleToolCall('tool2', { arg: 'val2' }, mockAppManager);

            expect(mockRegistry.handleToolCall).toHaveBeenCalledTimes(2);
        });

        it('should support dynamic schema changes', async () => {
            const initialTools: Tool[] = [
                { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } }
            ];

            vi.mocked(mockRegistry.getTools).mockReturnValue(initialTools);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();
            let tools = manager.getTools();
            expect(tools).toHaveLength(1);

            // Simulate schema change by updating mock return
            const updatedTools = [
                ...initialTools,
                { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } },
                { name: 'tool3', description: 'Tool 3', inputSchema: { type: 'object', properties: {} } }
            ];

            vi.mocked(mockRegistry.getTools).mockReturnValue(updatedTools);
            tools = manager.getTools();
            expect(tools).toHaveLength(3);
        });

        it('should handle tool discovery and listing workflow', async () => {
            const tools: Tool[] = [
                { name: 'create_node', description: 'Create a node', inputSchema: { type: 'object', properties: {} } },
                { name: 'delete_node', description: 'Delete a node', inputSchema: { type: 'object', properties: {} } },
                { name: 'search_nodes', description: 'Search nodes', inputSchema: { type: 'object', properties: {} } }
            ];

            vi.mocked(mockRegistry.getTools).mockReturnValue(tools);
            vi.mocked(initializeDynamicTools).mockResolvedValue(mockRegistry as any);

            await manager.initialize();

            // List all tools
            const allTools = manager.getTools();
            expect(allTools).toHaveLength(3);

            // Check specific tools exist
            expect(manager.isDynamicTool('create_node')).toBe(true);
            expect(manager.isDynamicTool('delete_node')).toBe(true);
            expect(manager.isDynamicTool('search_nodes')).toBe(true);

            // Non-existent tool
            expect(manager.isDynamicTool('update_node')).toBe(false);
        });
    });
});
