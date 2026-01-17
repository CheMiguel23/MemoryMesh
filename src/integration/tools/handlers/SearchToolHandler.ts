// src/tools/handlers/SearchToolHandler.ts

import {BaseToolHandler} from './BaseToolHandler.js';
import {formatToolResponse, formatToolError} from '@shared/index.js';
import type {ToolResponse} from '@shared/index.js';

export class SearchToolHandler extends BaseToolHandler {
    async handleTool(name: string, args: Record<string, any>): Promise<ToolResponse> {
        try {
            this.validateArguments(args);

            switch (name) {
                case "read_graph": {
                    const graph = await this.knowledgeGraphManager.readGraph();
                    const isEmpty = graph.nodes.length === 0 && graph.edges.length === 0;
                    return formatToolResponse({
                        data: graph,
                        actionTaken: isEmpty
                            ? "Read complete knowledge graph (graph is empty - no nodes or edges exist yet)"
                            : `Read complete knowledge graph (${graph.nodes.length} nodes, ${graph.edges.length} edges)`
                    });
                }

                case "search_nodes": {
                    const searchResults = await this.knowledgeGraphManager.searchNodes(args.query);
                    const isEmpty = searchResults.nodes.length === 0;
                    return formatToolResponse({
                        data: searchResults,
                        actionTaken: isEmpty
                            ? `Searched nodes with query: "${args.query}" - no matching nodes found`
                            : `Searched nodes with query: "${args.query}" - found ${searchResults.nodes.length} nodes`
                    });
                }

                case "open_nodes": {
                    const nodes = await this.knowledgeGraphManager.openNodes(args.names);
                    const requestedNames = args.names as string[];
                    const foundNames = nodes.nodes.map((n: any) => n.name);
                    const notFound = requestedNames.filter(name => !foundNames.includes(name));

                    let actionTaken: string;
                    if (nodes.nodes.length === 0) {
                        actionTaken = `None of the requested nodes were found: ${requestedNames.join(', ')}`;
                    } else if (notFound.length > 0) {
                        actionTaken = `Retrieved ${nodes.nodes.length} nodes. Not found: ${notFound.join(', ')}`;
                    } else {
                        actionTaken = `Retrieved nodes: ${requestedNames.join(', ')}`;
                    }

                    return formatToolResponse({
                        data: nodes,
                        actionTaken
                    });
                }

                default:
                    throw new Error(`Unknown search operation: ${name}`);
            }
        } catch (error) {
            return formatToolError({
                operation: name,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                context: {args},
                suggestions: [
                    "Check node names exist",
                    "Verify search query format"
                ],
                recoverySteps: [
                    "Try with different node names",
                    "Adjust search query parameters"
                ]
            });
        }
    }
}