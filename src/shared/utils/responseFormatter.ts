// src/utils/responseFormatter.ts

import type {
    ToolResponse,
    ContentBlock,
    StructuredContent,
    ToolResponseOptions,
    ToolErrorOptions,
    PartialSuccessOptions
} from '@shared/index.js';

/**
 * Formats successful tool responses following MCP standard.
 */
export function formatToolResponse<T = any>({
                                                data,
                                                message,
                                                actionTaken,
                                                suggestions = []
                                            }: ToolResponseOptions<T>): ToolResponse<T> {
    const content: ContentBlock[] = message ? [{type: "text", text: message}] : [];

    const structuredContent: StructuredContent = {
        timestamp: new Date().toISOString()
    };

    if (data !== undefined) {
        structuredContent.data = data;
    }

    if (actionTaken) {
        structuredContent.actionTaken = actionTaken;
    }

    if (suggestions.length > 0) {
        structuredContent.suggestions = suggestions;
    }

    return {
        content,
        isError: false,
        structuredContent
    };
}

/**
 * Formats error responses following MCP standard.
 */
export function formatToolError({
                                    operation,
                                    error,
                                    context,
                                    suggestions = [],
                                    recoverySteps = []
                                }: ToolErrorOptions): ToolResponse {
    const content: ContentBlock[] = [
        {type: "text", text: `Error during ${operation}: ${error}`},
        ...(context ? [{type: "text", text: `Context: ${JSON.stringify(context)}`}] : [])
    ];

    const structuredContent: StructuredContent = {
        timestamp: new Date().toISOString()
    };

    if (suggestions.length > 0) {
        structuredContent.suggestions = suggestions;
    }

    if (recoverySteps.length > 0) {
        structuredContent.recoverySteps = recoverySteps;
    }

    return {
        content,
        isError: true,
        structuredContent
    };
}

/**
 * Creates an informative message for partial success scenarios following MCP standard.
 */
export function formatPartialSuccess<T>({
                                            operation,
                                            attempted,
                                            succeeded,
                                            failed,
                                            details
                                        }: PartialSuccessOptions<T>): ToolResponse {
    const content: ContentBlock[] = [
        {
            type: "text",
            text: `Partial success for ${operation}: ${succeeded.length} succeeded, ${failed.length} failed`
        },
        {
            type: "text",
            text: `Details: ${JSON.stringify(details)}`
        }
    ];

    const structuredContent: StructuredContent = {
        data: {
            succeededItems: succeeded,
            failedItems: failed.map(item => ({
                item,
                reason: details[String(item)] || 'Unknown error'
            }))
        },
        suggestions: [
            "Review failed items and their reasons",
            "Consider retrying failed operations individually",
            "Verify requirements for failed items"
        ],
        timestamp: new Date().toISOString()
    };

    return {
        content,
        isError: true,
        structuredContent
    };
}