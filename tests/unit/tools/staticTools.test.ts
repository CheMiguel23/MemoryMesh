import { describe, it, expect } from 'vitest';
import {
    graphTools,
    searchTools,
    metadataTools,
    allStaticTools
} from '../../../src/integration/tools/registry/staticTools.js';
import type { Tool } from '../../../src/shared/types/tools.js';

describe('Static Tools - MCP Compliance', () => {
    describe('Tool Definition Structure', () => {
        it('should have all required tools defined', () => {
            const expectedTools = [
                'add_nodes', 'update_nodes', 'delete_nodes',
                'add_edges', 'update_edges', 'delete_edges',
                'read_graph', 'search_nodes', 'open_nodes',
                'add_metadata', 'delete_metadata'
            ];

            const toolNames = allStaticTools.map(t => t.name);
            expectedTools.forEach(name => {
                expect(toolNames).toContain(name);
            });
        });

        it('should have unique tool names', () => {
            const names = allStaticTools.map(t => t.name);
            const uniqueNames = new Set(names);
            expect(names.length).toBe(uniqueNames.size);
        });

        allStaticTools.forEach((tool: Tool) => {
            describe(`Tool: ${tool.name}`, () => {
                it('should have a name', () => {
                    expect(tool.name).toBeDefined();
                    expect(typeof tool.name).toBe('string');
                    expect(tool.name.length).toBeGreaterThan(0);
                });

                it('should have a description', () => {
                    expect(tool.description).toBeDefined();
                    expect(typeof tool.description).toBe('string');
                    expect(tool.description.length).toBeGreaterThan(0);
                });

                it('should have inputSchema with type "object"', () => {
                    expect(tool.inputSchema).toBeDefined();
                    expect(tool.inputSchema.type).toBe('object');
                });

                it('should have properties defined in inputSchema', () => {
                    expect(tool.inputSchema.properties).toBeDefined();
                    expect(typeof tool.inputSchema.properties).toBe('object');
                });
            });
        });
    });

    describe('Graph Tools', () => {
        it('should have 6 graph tools', () => {
            expect(graphTools).toHaveLength(6);
        });

        describe('add_nodes', () => {
            const tool = graphTools.find(t => t.name === 'add_nodes')!;

            it('should require nodes array', () => {
                expect(tool.inputSchema.required).toContain('nodes');
            });

            it('should define nodes as array type', () => {
                expect(tool.inputSchema.properties.nodes.type).toBe('array');
            });

            it('should require name, nodeType, metadata in node items', () => {
                const items = tool.inputSchema.properties.nodes.items;
                expect(items?.required).toContain('name');
                expect(items?.required).toContain('nodeType');
                expect(items?.required).toContain('metadata');
            });
        });

        describe('add_edges', () => {
            const tool = graphTools.find(t => t.name === 'add_edges')!;

            it('should require edges array', () => {
                expect(tool.inputSchema.required).toContain('edges');
            });

            it('should require from, to, edgeType in edge items', () => {
                const items = tool.inputSchema.properties.edges.items;
                expect(items?.required).toContain('from');
                expect(items?.required).toContain('to');
                expect(items?.required).toContain('edgeType');
            });

            it('should have optional weight with min/max constraints', () => {
                const items = tool.inputSchema.properties.edges.items;
                const weightProp = items?.properties?.weight;
                expect(weightProp).toBeDefined();
                expect(weightProp?.type).toBe('number');
                expect(weightProp?.minimum).toBe(0);
                expect(weightProp?.maximum).toBe(1);
            });
        });

        describe('delete_nodes', () => {
            const tool = graphTools.find(t => t.name === 'delete_nodes')!;

            it('should require nodeNames array', () => {
                expect(tool.inputSchema.required).toContain('nodeNames');
            });

            it('should define nodeNames as array of strings', () => {
                expect(tool.inputSchema.properties.nodeNames.type).toBe('array');
                expect(tool.inputSchema.properties.nodeNames.items?.type).toBe('string');
            });
        });
    });

    describe('Search Tools', () => {
        it('should have 3 search tools', () => {
            expect(searchTools).toHaveLength(3);
        });

        describe('read_graph', () => {
            const tool = searchTools.find(t => t.name === 'read_graph')!;

            it('should have empty properties (no required input)', () => {
                expect(Object.keys(tool.inputSchema.properties)).toHaveLength(0);
            });

            it('should not have required fields', () => {
                expect(tool.inputSchema.required).toBeUndefined();
            });
        });

        describe('search_nodes', () => {
            const tool = searchTools.find(t => t.name === 'search_nodes')!;

            it('should require query parameter', () => {
                expect(tool.inputSchema.required).toContain('query');
            });

            it('should define query as string', () => {
                expect(tool.inputSchema.properties.query.type).toBe('string');
            });
        });

        describe('open_nodes', () => {
            const tool = searchTools.find(t => t.name === 'open_nodes')!;

            it('should require names array', () => {
                expect(tool.inputSchema.required).toContain('names');
            });

            it('should define names as array of strings', () => {
                expect(tool.inputSchema.properties.names.type).toBe('array');
                expect(tool.inputSchema.properties.names.items?.type).toBe('string');
            });
        });
    });

    describe('Metadata Tools', () => {
        it('should have 2 metadata tools', () => {
            expect(metadataTools).toHaveLength(2);
        });

        describe('add_metadata', () => {
            const tool = metadataTools.find(t => t.name === 'add_metadata')!;

            it('should require metadata array', () => {
                expect(tool.inputSchema.required).toContain('metadata');
            });

            it('should require nodeName and contents in metadata items', () => {
                const items = tool.inputSchema.properties.metadata.items;
                expect(items?.required).toContain('nodeName');
                expect(items?.required).toContain('contents');
            });
        });

        describe('delete_metadata', () => {
            const tool = metadataTools.find(t => t.name === 'delete_metadata')!;

            it('should require deletions array', () => {
                expect(tool.inputSchema.required).toContain('deletions');
            });

            it('should require nodeName and metadata in deletion items', () => {
                const items = tool.inputSchema.properties.deletions.items;
                expect(items?.required).toContain('nodeName');
                expect(items?.required).toContain('metadata');
            });
        });
    });

    describe('MCP inputSchema Compliance', () => {
        allStaticTools.forEach((tool: Tool) => {
            it(`${tool.name} inputSchema.type should be literal "object"`, () => {
                // MCP spec requires inputSchema.type to be exactly "object"
                expect(tool.inputSchema.type).toBe('object');
            });

            it(`${tool.name} should have valid JSON Schema structure`, () => {
                // All tools should have properties object
                expect(tool.inputSchema.properties).toBeDefined();
                expect(typeof tool.inputSchema.properties).toBe('object');

                // If required is present, it should be an array
                if (tool.inputSchema.required !== undefined) {
                    expect(Array.isArray(tool.inputSchema.required)).toBe(true);
                }
            });
        });
    });

    describe('Tool Categories', () => {
        it('allStaticTools should combine all tool categories', () => {
            expect(allStaticTools.length).toBe(
                graphTools.length + searchTools.length + metadataTools.length
            );
        });

        it('should contain all graph tools', () => {
            graphTools.forEach(tool => {
                expect(allStaticTools).toContain(tool);
            });
        });

        it('should contain all search tools', () => {
            searchTools.forEach(tool => {
                expect(allStaticTools).toContain(tool);
            });
        });

        it('should contain all metadata tools', () => {
            metadataTools.forEach(tool => {
                expect(allStaticTools).toContain(tool);
            });
        });
    });
});
