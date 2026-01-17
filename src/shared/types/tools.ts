// src/types/tools.ts

/**
 * Schema definition for tool parameters
 */
export interface ToolSchema {
    type: string;
    properties: Record<string, SchemaProperty>;
    required?: string[];
}

/**
 * Property definition in a tool schema
 */
export interface SchemaProperty {
    type: string;
    description: string;
    items?: SchemaProperty;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
    enum?: string[];
    minimum?: number;
    maximum?: number;
}

/**
 * Tool definition
 */
export interface Tool {
    name: string;
    description: string;
    inputSchema: ToolSchema;
}

/**
 * Content block in a tool result (MCP standard)
 */
export interface ContentBlock {
    type: string;
    text: string;
}

/**
 * Structured content for additional tool result data
 */
export interface StructuredContent {
    data?: any;
    actionTaken?: string;
    timestamp?: string;
    suggestions?: string[];
    recoverySteps?: string[];
    [key: string]: any;
}

/**
 * Tool response following MCP standard (CallToolResult)
 */
export interface ToolResponse<T = any> {
    content: ContentBlock[];
    isError?: boolean;
    structuredContent?: StructuredContent;
}

/**
 * Options for formatting a tool response
 */
export interface ToolResponseOptions<T = any> {
    data?: T;
    message?: string;
    actionTaken?: string;
    suggestions?: string[];
}

/**
 * Options for formatting a tool error
 */
export interface ToolErrorOptions {
    operation: string;
    error: string;
    context?: Record<string, any>;
    suggestions?: string[];
    recoverySteps?: string[];
}

/**
 * Options for formatting a partial success response
 */
export interface PartialSuccessOptions<T = any> {
    operation: string;
    attempted: T[];
    succeeded: T[];
    failed: T[];
    details: Record<string, string>;
}

/**
 * Request format for tool calls
 */
export interface ToolCallRequest {
    params: {
        name: string;
        arguments?: Record<string, any>;
    };
}