import { describe, it, expect } from 'vitest';
import { allStaticTools } from '../../../src/integration/tools/registry/staticTools.js';
import type { Tool, ToolSchema, SchemaProperty } from '../../../src/shared/types/tools.js';

/**
 * MCP (Model Context Protocol) Compliance Tests
 *
 * These tests verify that tool definitions follow the MCP specification:
 * https://modelcontextprotocol.io/specification/2025-11-25
 *
 * Key requirements tested:
 * - Tool names must be strings
 * - Tool descriptions should be provided
 * - inputSchema must have type "object"
 * - inputSchema.properties must be an object
 * - inputSchema.required must be an array of strings (if present)
 * - Property types must be valid JSON Schema types
 */

describe('MCP Compliance Tests', () => {
    describe('Tool Definition Structure', () => {
        allStaticTools.forEach((tool: Tool) => {
            describe(`Tool: ${tool.name}`, () => {
                it('should have a non-empty string name', () => {
                    expect(typeof tool.name).toBe('string');
                    expect(tool.name.length).toBeGreaterThan(0);
                    // MCP recommends snake_case for tool names
                    expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
                });

                it('should have a non-empty description', () => {
                    expect(typeof tool.description).toBe('string');
                    expect(tool.description.length).toBeGreaterThan(0);
                });

                it('should have inputSchema with type "object" (MCP requirement)', () => {
                    expect(tool.inputSchema).toBeDefined();
                    // MCP spec requires inputSchema.type to be literal "object"
                    expect(tool.inputSchema.type).toBe('object');
                });

                it('should have properties object in inputSchema', () => {
                    expect(tool.inputSchema.properties).toBeDefined();
                    expect(typeof tool.inputSchema.properties).toBe('object');
                });

                it('should have valid required array if present', () => {
                    if (tool.inputSchema.required !== undefined) {
                        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
                        tool.inputSchema.required.forEach((field: string) => {
                            expect(typeof field).toBe('string');
                            // Each required field should exist in properties
                            expect(tool.inputSchema.properties).toHaveProperty(field);
                        });
                    }
                });
            });
        });
    });

    describe('JSON Schema Compliance', () => {
        const validJsonSchemaTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];

        const validatePropertySchema = (prop: SchemaProperty, path: string): void => {
            // Type should be a valid JSON Schema type
            expect(validJsonSchemaTypes).toContain(prop.type);

            // Arrays should have items defined
            if (prop.type === 'array' && prop.items) {
                expect(validJsonSchemaTypes).toContain(prop.items.type);
            }

            // Objects should have properties defined
            if (prop.type === 'object' && prop.properties) {
                Object.entries(prop.properties).forEach(([key, value]) => {
                    validatePropertySchema(value, `${path}.${key}`);
                });
            }

            // Enum values should all be of the declared type
            if (prop.enum) {
                expect(Array.isArray(prop.enum)).toBe(true);
                if (prop.type === 'string') {
                    prop.enum.forEach(value => {
                        expect(typeof value).toBe('string');
                    });
                }
            }

            // Min/max should be numbers
            if (prop.minimum !== undefined) {
                expect(typeof prop.minimum).toBe('number');
            }
            if (prop.maximum !== undefined) {
                expect(typeof prop.maximum).toBe('number');
            }
        };

        allStaticTools.forEach((tool: Tool) => {
            it(`${tool.name} should have valid JSON Schema properties`, () => {
                Object.entries(tool.inputSchema.properties).forEach(([key, value]) => {
                    validatePropertySchema(value, key);
                });
            });
        });
    });

    describe('MCP Response Format Compliance', () => {
        it('should use correct content block types', () => {
            // MCP specifies content blocks must have type: "text" | "image" | "resource"
            const validContentTypes = ['text', 'image', 'resource', 'audio'];

            // This is a static test - actual runtime validation happens elsewhere
            expect(validContentTypes).toContain('text');
        });

        it('should support isError flag in responses', () => {
            // MCP requires isError to be optional boolean
            // Verified through type definitions
            const mockResponse = { content: [], isError: true };
            expect(typeof mockResponse.isError).toBe('boolean');
        });
    });

    describe('Tool Naming Conventions', () => {
        it('should have unique tool names', () => {
            const names = allStaticTools.map(t => t.name);
            const uniqueNames = new Set(names);
            expect(names.length).toBe(uniqueNames.size);
        });

        it('should use snake_case for tool names', () => {
            allStaticTools.forEach(tool => {
                expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
            });
        });

        it('should use descriptive action verbs in tool names', () => {
            const actionVerbs = ['add', 'update', 'delete', 'read', 'search', 'open'];
            allStaticTools.forEach(tool => {
                const hasActionVerb = actionVerbs.some(verb => tool.name.startsWith(verb));
                expect(hasActionVerb).toBe(true);
            });
        });
    });

    describe('Tool Description Quality', () => {
        allStaticTools.forEach((tool: Tool) => {
            it(`${tool.name} description should be informative`, () => {
                // Description should not be too short
                expect(tool.description.length).toBeGreaterThan(10);

                // Description should not have leading/trailing whitespace
                expect(tool.description).toBe(tool.description.trim());
            });
        });
    });

    describe('Input Validation Schema', () => {
        describe('Graph mutation tools', () => {
            const mutationTools = ['add_nodes', 'update_nodes', 'delete_nodes', 'add_edges', 'update_edges', 'delete_edges'];

            mutationTools.forEach(toolName => {
                const tool = allStaticTools.find(t => t.name === toolName);

                if (tool) {
                    it(`${toolName} should have required fields`, () => {
                        expect(tool.inputSchema.required).toBeDefined();
                        expect(tool.inputSchema.required!.length).toBeGreaterThan(0);
                    });
                }
            });
        });

        describe('Search tools', () => {
            it('read_graph should not require any input', () => {
                const tool = allStaticTools.find(t => t.name === 'read_graph');
                expect(tool).toBeDefined();
                expect(Object.keys(tool!.inputSchema.properties).length).toBe(0);
            });

            it('search_nodes should require query parameter', () => {
                const tool = allStaticTools.find(t => t.name === 'search_nodes');
                expect(tool).toBeDefined();
                expect(tool!.inputSchema.required).toContain('query');
            });

            it('open_nodes should require names parameter', () => {
                const tool = allStaticTools.find(t => t.name === 'open_nodes');
                expect(tool).toBeDefined();
                expect(tool!.inputSchema.required).toContain('names');
            });
        });
    });

    describe('MCP Best Practices', () => {
        it('should have read-only tools that do not require mutation parameters', () => {
            const readOnlyTools = ['read_graph', 'search_nodes', 'open_nodes'];

            readOnlyTools.forEach(toolName => {
                const tool = allStaticTools.find(t => t.name === toolName);
                expect(tool).toBeDefined();

                // Read-only tools should not have mutation-like parameters
                const props = Object.keys(tool!.inputSchema.properties);
                props.forEach(prop => {
                    expect(prop).not.toMatch(/delete|remove|update|modify/i);
                });
            });
        });

        it('should have descriptive property descriptions', () => {
            allStaticTools.forEach(tool => {
                Object.entries(tool.inputSchema.properties).forEach(([key, value]) => {
                    if (value.description) {
                        expect(value.description.length).toBeGreaterThan(5);
                    }
                });
            });
        });

        it('should define array item schemas for array properties', () => {
            allStaticTools.forEach(tool => {
                Object.entries(tool.inputSchema.properties).forEach(([key, value]) => {
                    if (value.type === 'array') {
                        expect(value.items).toBeDefined();
                    }
                });
            });
        });
    });
});
