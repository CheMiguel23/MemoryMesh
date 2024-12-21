// src/core/managers/implementations/NodeManager.ts

import {INodeManager} from '../interfaces/INodeManager.js';
import type {Node} from '../../../types/graph.js';

/**
 * Implements node-related operations for the knowledge graph.
 * Includes adding, updating, deleting, and retrieving nodes.
 */
export class NodeManager extends INodeManager {
    /**
     * Adds new nodes to the knowledge graph.
     */
    async addNodes(nodes: Node[]): Promise<Node[]> {
        try {
            this.emit('beforeAddNodes', {nodes});

            const graph = await this.storage.loadGraph();
            const newNodes: Node[] = [];

            for (const node of nodes) {
                if (!node.name || !node.nodeType) {
                    throw new Error("Node must have a 'name' and 'nodeType'");
                }

                if (graph.nodes.some(existing => existing.name === node.name)) {
                    throw new Error(`Node already exists: ${node.name}. Consider updating existing node.`);
                }

                newNodes.push(node);
            }

            graph.nodes.push(...newNodes);
            await this.storage.saveGraph(graph);

            this.emit('afterAddNodes', {nodes: newNodes});
            return newNodes;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(errorMessage);
        }
    }

    /**
     * Updates existing nodes in the knowledge graph.
     */
    async updateNodes(nodes: Partial<Node>[]): Promise<Node[]> {
        try {
            this.emit('beforeUpdateNodes', {nodes});

            const graph = await this.storage.loadGraph();
            const updatedNodes: Node[] = [];

            for (const updateNode of nodes) {
                if (!updateNode.name) {
                    throw new Error("Node must have a 'name' for updating");
                }

                const nodeIndex = graph.nodes.findIndex(n => n.name === updateNode.name);
                if (nodeIndex === -1) {
                    throw new Error(`Node not found: ${updateNode.name}`);
                }

                graph.nodes[nodeIndex] = {
                    ...graph.nodes[nodeIndex],
                    ...updateNode
                };
                updatedNodes.push(graph.nodes[nodeIndex]);
            }

            await this.storage.saveGraph(graph);

            this.emit('afterUpdateNodes', {nodes: updatedNodes});
            return updatedNodes;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(errorMessage);
        }
    }

    /**
     * Deletes nodes and their associated edges from the knowledge graph.
     */
    async deleteNodes(nodeNames: string[]): Promise<void> {
        try {
            if (!Array.isArray(nodeNames)) {
                throw new Error("nodeNames must be an array");
            }

            this.emit('beforeDeleteNodes', {nodeNames});

            const graph = await this.storage.loadGraph();
            const initialNodeCount = graph.nodes.length;

            graph.nodes = graph.nodes.filter(node => !nodeNames.includes(node.name));
            graph.edges = graph.edges.filter(edge =>
                !nodeNames.includes(edge.from) && !nodeNames.includes(edge.to)
            );

            const deletedCount = initialNodeCount - graph.nodes.length;

            await this.storage.saveGraph(graph);

            this.emit('afterDeleteNodes', {deletedCount});
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(errorMessage);
        }
    }

    /**
     * Retrieves specific nodes from the knowledge graph by their names.
     */
    async getNodes(nodeNames: string[]): Promise<Node[]> {
        try {
            const graph = await this.storage.loadGraph();
            return graph.nodes.filter(node => nodeNames.includes(node.name));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(errorMessage);
        }
    }
}