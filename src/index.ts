#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {ApplicationManager} from '@application/managers/ApplicationManager.js';
import {handleCallToolRequest} from '@integration/tools/callToolHandler.js';
import {toolsRegistry} from '@integration/tools/registry/toolsRegistry.js';
import {CONFIG} from './config/config.js';
import {formatToolError} from "@shared/utils/responseFormatter.js";

const knowledgeGraphManager = new ApplicationManager();

const server = new Server({
    name: CONFIG.SERVER.NAME,
    version: CONFIG.SERVER.VERSION,
}, {
    capabilities: {
        tools: {},
    },
});

async function main(): Promise<void> {
    try {
        await toolsRegistry.initialize(knowledgeGraphManager);

        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: toolsRegistry.getAllTools().map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
            try {
                if (!request.params.arguments) {
                    throw new Error("Tool arguments are required");
                }

                const toolRequest = {
                    params: {
                        name: request.params.name,
                        arguments: request.params.arguments
                    }
                };

                const result = await handleCallToolRequest(toolRequest, knowledgeGraphManager);

                return result as CallToolResult;
            } catch (error) {
                console.error("Error in handleCallToolRequest:", error);
                return formatToolError({
                    operation: "callTool",
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                    context: {request},
                    suggestions: ["Examine the tool input parameters for correctness.", "Verify that the requested operation is supported."],
                    recoverySteps: ["Adjust the input parameters based on the schema definition."]
                }) as CallToolResult;
            }
        });

        server.onerror = (error: Error) => {
            console.error("[MCP Server Error]", error);
        };

        process.on('SIGINT', async () => {
            await server.close();
            process.exit(0);
        });

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Knowledge Graph MCP Server running on stdio");
    } catch (error) {
        console.error("Fatal error during server startup:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});