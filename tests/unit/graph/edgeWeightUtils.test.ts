import { describe, it, expect } from 'vitest';
import { EdgeWeightUtils } from '../../../src/core/graph/EdgeWeightUtils.js';
import type { Edge } from '../../../src/core/graph/Edge.js';

describe('EdgeWeightUtils', () => {
    const createEdge = (from: string, to: string, edgeType: string, weight?: number): Edge => ({
        type: 'edge',
        from,
        to,
        edgeType,
        ...(weight !== undefined && { weight })
    });

    describe('validateWeight', () => {
        it('should accept weight of 0', () => {
            expect(() => EdgeWeightUtils.validateWeight(0)).not.toThrow();
        });

        it('should accept weight of 1', () => {
            expect(() => EdgeWeightUtils.validateWeight(1)).not.toThrow();
        });

        it('should accept weight between 0 and 1', () => {
            expect(() => EdgeWeightUtils.validateWeight(0.5)).not.toThrow();
            expect(() => EdgeWeightUtils.validateWeight(0.1)).not.toThrow();
            expect(() => EdgeWeightUtils.validateWeight(0.99)).not.toThrow();
        });

        it('should reject negative weight', () => {
            expect(() => EdgeWeightUtils.validateWeight(-0.1))
                .toThrow('Edge weight must be between 0 and 1');
        });

        it('should reject weight greater than 1', () => {
            expect(() => EdgeWeightUtils.validateWeight(1.1))
                .toThrow('Edge weight must be between 0 and 1');
        });
    });

    describe('ensureWeight', () => {
        it('should add default weight of 1 when weight is undefined', () => {
            const edge = createEdge('a', 'b', 'knows');
            const result = EdgeWeightUtils.ensureWeight(edge);

            expect(result.weight).toBe(1);
        });

        it('should preserve existing weight', () => {
            const edge = createEdge('a', 'b', 'knows', 0.5);
            const result = EdgeWeightUtils.ensureWeight(edge);

            expect(result.weight).toBe(0.5);
        });

        it('should preserve weight of 0', () => {
            const edge = createEdge('a', 'b', 'knows', 0);
            const result = EdgeWeightUtils.ensureWeight(edge);

            expect(result.weight).toBe(0);
        });

        it('should not mutate original edge', () => {
            const edge = createEdge('a', 'b', 'knows');
            EdgeWeightUtils.ensureWeight(edge);

            expect(edge.weight).toBeUndefined();
        });

        it('should preserve all other edge properties', () => {
            const edge = createEdge('a', 'b', 'knows');
            const result = EdgeWeightUtils.ensureWeight(edge);

            expect(result.from).toBe('a');
            expect(result.to).toBe('b');
            expect(result.edgeType).toBe('knows');
            expect(result.type).toBe('edge');
        });
    });

    describe('updateWeight', () => {
        it('should average current weight with new evidence', () => {
            const result = EdgeWeightUtils.updateWeight(0.8, 0.4);

            expect(result).toBeCloseTo(0.6); // (0.8 + 0.4) / 2
        });

        it('should handle equal weights', () => {
            const result = EdgeWeightUtils.updateWeight(0.5, 0.5);

            expect(result).toBe(0.5);
        });

        it('should handle zero current weight', () => {
            const result = EdgeWeightUtils.updateWeight(0, 1);

            expect(result).toBe(0.5);
        });

        it('should handle zero new evidence', () => {
            const result = EdgeWeightUtils.updateWeight(1, 0);

            expect(result).toBe(0.5);
        });

        it('should validate new evidence weight', () => {
            expect(() => EdgeWeightUtils.updateWeight(0.5, 1.5))
                .toThrow('Edge weight must be between 0 and 1');
        });

        it('should validate negative new evidence', () => {
            expect(() => EdgeWeightUtils.updateWeight(0.5, -0.1))
                .toThrow('Edge weight must be between 0 and 1');
        });
    });

    describe('combineWeights', () => {
        it('should return maximum weight', () => {
            const result = EdgeWeightUtils.combineWeights([0.3, 0.7, 0.5]);

            expect(result).toBe(0.7);
        });

        it('should return 1 for empty array', () => {
            const result = EdgeWeightUtils.combineWeights([]);

            expect(result).toBe(1);
        });

        it('should handle single weight', () => {
            const result = EdgeWeightUtils.combineWeights([0.5]);

            expect(result).toBe(0.5);
        });

        it('should handle all same weights', () => {
            const result = EdgeWeightUtils.combineWeights([0.5, 0.5, 0.5]);

            expect(result).toBe(0.5);
        });

        it('should handle weight of 0', () => {
            const result = EdgeWeightUtils.combineWeights([0, 0, 0]);

            expect(result).toBe(0);
        });

        it('should handle mixed weights including 0 and 1', () => {
            const result = EdgeWeightUtils.combineWeights([0, 0.5, 1]);

            expect(result).toBe(1);
        });
    });
});
