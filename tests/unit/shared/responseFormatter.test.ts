import { describe, it, expect, beforeEach } from 'vitest';
import {
    formatToolResponse,
    formatToolError,
    formatPartialSuccess
} from '../../../src/shared/utils/responseFormatter.js';

describe('responseFormatter', () => {
    describe('formatToolResponse', () => {
        it('should format a successful response with data', () => {
            const result = formatToolResponse({
                data: { nodes: [{ name: 'test', nodeType: 'npc' }] },
                actionTaken: 'Added node'
            });

            expect(result.isError).toBe(false);
            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect(result.structuredContent?.data).toEqual({ nodes: [{ name: 'test', nodeType: 'npc' }] });
            expect(result.structuredContent?.actionTaken).toBe('Added node');
            expect(result.structuredContent?.timestamp).toBeDefined();
        });

        it('should include message in content when provided', () => {
            const result = formatToolResponse({
                message: 'Operation completed',
                data: { success: true }
            });

            expect(result.content).toHaveLength(2);
            expect(result.content[0].text).toBe('Operation completed');
        });

        it('should include suggestions when provided', () => {
            const result = formatToolResponse({
                data: { result: 'ok' },
                suggestions: ['Try this', 'Or that']
            });

            expect(result.structuredContent?.suggestions).toEqual(['Try this', 'Or that']);
        });

        it('should serialize data as JSON in text content for backwards compatibility', () => {
            const data = { nodes: [{ name: 'test' }] };
            const result = formatToolResponse({ data });

            const jsonContent = result.content.find(c => c.text.includes('"nodes"'));
            expect(jsonContent).toBeDefined();
            expect(JSON.parse(jsonContent!.text)).toEqual(data);
        });

        it('should handle undefined data gracefully', () => {
            const result = formatToolResponse({
                actionTaken: 'Completed'
            });

            expect(result.isError).toBe(false);
            expect(result.content).toHaveLength(0);
            expect(result.structuredContent?.data).toBeUndefined();
        });
    });

    describe('formatToolError', () => {
        it('should format an error response', () => {
            const result = formatToolError({
                operation: 'add_nodes',
                error: 'Node already exists'
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error during add_nodes');
            expect(result.content[0].text).toContain('Node already exists');
        });

        it('should include context in content when provided', () => {
            const result = formatToolError({
                operation: 'delete_nodes',
                error: 'Node not found',
                context: { nodeName: 'test' }
            });

            expect(result.content.length).toBeGreaterThan(1);
            const contextContent = result.content.find(c => c.text.includes('Context'));
            expect(contextContent).toBeDefined();
        });

        it('should include suggestions when provided', () => {
            const result = formatToolError({
                operation: 'update_nodes',
                error: 'Invalid input',
                suggestions: ['Check node name', 'Verify format']
            });

            expect(result.structuredContent?.suggestions).toEqual(['Check node name', 'Verify format']);
        });

        it('should include recovery steps when provided', () => {
            const result = formatToolError({
                operation: 'add_edges',
                error: 'Source node missing',
                recoverySteps: ['Create source node first', 'Retry operation']
            });

            expect(result.structuredContent?.recoverySteps).toEqual([
                'Create source node first',
                'Retry operation'
            ]);
        });

        it('should include timestamp', () => {
            const result = formatToolError({
                operation: 'test',
                error: 'Test error'
            });

            expect(result.structuredContent?.timestamp).toBeDefined();
            expect(new Date(result.structuredContent!.timestamp!).getTime()).not.toBeNaN();
        });
    });

    describe('formatPartialSuccess', () => {
        it('should format a partial success response', () => {
            const result = formatPartialSuccess({
                operation: 'add_nodes',
                attempted: ['node1', 'node2', 'node3'],
                succeeded: ['node1', 'node2'],
                failed: ['node3'],
                details: { node3: 'Already exists' }
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Partial success');
            expect(result.content[0].text).toContain('2 succeeded');
            expect(result.content[0].text).toContain('1 failed');
        });

        it('should include succeeded and failed items in structured content', () => {
            const result = formatPartialSuccess({
                operation: 'update_nodes',
                attempted: ['a', 'b'],
                succeeded: ['a'],
                failed: ['b'],
                details: { b: 'Not found' }
            });

            expect(result.structuredContent?.data?.succeededItems).toEqual(['a']);
            expect(result.structuredContent?.data?.failedItems).toEqual([
                { item: 'b', reason: 'Not found' }
            ]);
        });

        it('should include default suggestions', () => {
            const result = formatPartialSuccess({
                operation: 'delete_nodes',
                attempted: ['x'],
                succeeded: [],
                failed: ['x'],
                details: { x: 'Error' }
            });

            expect(result.structuredContent?.suggestions).toBeDefined();
            expect(result.structuredContent?.suggestions?.length).toBeGreaterThan(0);
        });
    });
});
