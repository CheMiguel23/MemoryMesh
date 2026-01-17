// src/tools/handlers/DynamicToolHandler.ts

import {BaseToolHandler} from './BaseToolHandler.js';
import {dynamicToolManager} from '@integration/index.js';
import {formatToolError} from '@shared/index.js';
import type {ToolResponse} from '@shared/index.js';

export class DynamicToolHandler extends BaseToolHandler {
    async handleTool(name: string, args: Record<string, any>): Promise<ToolResponse> {
        try {
            this.validateArguments(args);

            // Response is already formatted by dynamicToolManager
            return await dynamicToolManager.handleToolCall(name, args, this.knowledgeGraphManager);
        } catch (error) {
            return formatToolError({
                operation: name,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                context: {toolName: name, args},
                suggestions: [
                    "Examine the tool input parameters for correctness",
                    "Verify that the requested operation is supported"
                ],
                recoverySteps: [
                    "Adjust the input parameters based on the schema definition"
                ]
            });
        }
    }
}