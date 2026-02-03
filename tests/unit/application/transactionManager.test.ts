import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionManager } from '../../../src/application/managers/TransactionManager.js';
import type { Graph } from '../../../src/core/index.js';
import type { IStorage } from '../../../src/infrastructure/index.js';

describe('TransactionManager', () => {
    let manager: TransactionManager;
    let mockStorage: IStorage;

    const sampleGraph: Graph = {
        nodes: [{ type: 'node', name: 'alice', nodeType: 'character', metadata: [] }],
        edges: []
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorage = {
            loadGraph: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(sampleGraph))),
            saveGraph: vi.fn().mockResolvedValue(undefined)
        } as unknown as IStorage;

        manager = new TransactionManager(mockStorage);
    });

    describe('beginTransaction()', () => {
        it('should begin transaction successfully', async () => {
            await manager.beginTransaction();

            expect(manager.isInTransaction()).toBe(true);
            expect(mockStorage.loadGraph).toHaveBeenCalled();
        });

        it('should load graph on begin', async () => {
            await manager.beginTransaction();

            const graph = manager.getCurrentGraph();
            expect(graph.nodes).toHaveLength(1);
        });

        it('should emit beforeBeginTransaction and afterBeginTransaction events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.beginTransaction();

            expect(emitSpy).toHaveBeenCalledWith('beforeBeginTransaction', {});
            expect(emitSpy).toHaveBeenCalledWith('afterBeginTransaction', {});
        });

        it('should throw if transaction already in progress', async () => {
            await manager.beginTransaction();

            await expect(manager.beginTransaction()).rejects.toThrow('Transaction already in progress');
        });

        it('should handle storage errors', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Load failed'));

            await expect(manager.beginTransaction()).rejects.toThrow('Failed to begin transaction');
        });
    });

    describe('commit()', () => {
        beforeEach(async () => {
            await manager.beginTransaction();
        });

        it('should commit transaction', async () => {
            await manager.commit();

            expect(manager.isInTransaction()).toBe(false);
        });

        it('should emit beforeCommit and afterCommit events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.commit();

            expect(emitSpy).toHaveBeenCalledWith('beforeCommit', {});
            expect(emitSpy).toHaveBeenCalledWith('afterCommit', {});
        });

        it('should clear rollback actions on commit', async () => {
            const rollbackFn = vi.fn();
            await manager.addRollbackAction(rollbackFn, 'test action');

            await manager.commit();

            // Rollback actions should be cleared
            expect(manager.isInTransaction()).toBe(false);
        });

        it('should throw if no transaction in progress', async () => {
            await manager.commit();

            await expect(manager.commit()).rejects.toThrow('No transaction to commit');
        });
    });

    describe('rollback()', () => {
        beforeEach(async () => {
            await manager.beginTransaction();
        });

        it('should rollback transaction', async () => {
            await manager.rollback();

            expect(manager.isInTransaction()).toBe(false);
        });

        it('should execute rollback actions in reverse order', async () => {
            const action1 = vi.fn();
            const action2 = vi.fn();
            const action3 = vi.fn();

            await manager.addRollbackAction(() => action1(), 'action1');
            await manager.addRollbackAction(() => action2(), 'action2');
            await manager.addRollbackAction(() => action3(), 'action3');

            await manager.rollback();

            // Should be called in reverse order
            expect(action3).toHaveBeenCalledBefore(action2);
            expect(action2).toHaveBeenCalledBefore(action1);
        });

        it('should emit beforeRollback and afterRollback events', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.rollback();

            expect(emitSpy).toHaveBeenCalledWith('beforeRollback', expect.any(Object));
            expect(emitSpy).toHaveBeenCalledWith('afterRollback', {});
        });

        it('should continue rollback even if action fails', async () => {
            const action1 = vi.fn().mockRejectedValue(new Error('Fail'));
            const action2 = vi.fn();

            await manager.addRollbackAction(action1, 'failing action');
            await manager.addRollbackAction(action2, 'ok action');

            await manager.rollback();

            expect(action1).toHaveBeenCalled();
            expect(action2).toHaveBeenCalled();
        });

        it('should throw if no transaction in progress', async () => {
            await manager.rollback();

            await expect(manager.rollback()).rejects.toThrow('No transaction to rollback');
        });

        it('should clear rollback actions after rollback', async () => {
            const action = vi.fn();
            await manager.addRollbackAction(action, 'test');

            await manager.rollback();

            // isInTransaction should be false, so adding actions should fail
            await expect(manager.addRollbackAction(action, 'test2')).rejects.toThrow('No transaction in progress');
        });
    });

    describe('addRollbackAction()', () => {
        beforeEach(async () => {
            await manager.beginTransaction();
        });

        it('should add rollback action', async () => {
            const action = vi.fn();

            await manager.addRollbackAction(action, 'test action');

            // Action should be queued but not executed
            expect(action).not.toHaveBeenCalled();
        });

        it('should throw if no transaction in progress', async () => {
            await manager.commit();

            const action = vi.fn();
            await expect(manager.addRollbackAction(action, 'test')).rejects.toThrow('No transaction in progress');
        });

        it('should handle multiple rollback actions', async () => {
            const action1 = vi.fn();
            const action2 = vi.fn();

            await manager.addRollbackAction(action1, 'action1');
            await manager.addRollbackAction(action2, 'action2');

            await manager.rollback();

            expect(action1).toHaveBeenCalled();
            expect(action2).toHaveBeenCalled();
        });
    });

    describe('getCurrentGraph()', () => {
        it('should return graph', async () => {
            await manager.beginTransaction();

            const graph = manager.getCurrentGraph();

            expect(graph).toEqual(sampleGraph);
        });

        it('should return loaded graph after begin', async () => {
            mockStorage.loadGraph = vi.fn().mockResolvedValue({
                nodes: [
                    { type: 'node', name: 'alice', nodeType: 'character', metadata: [] },
                    { type: 'node', name: 'bob', nodeType: 'character', metadata: [] }
                ],
                edges: []
            });

            await manager.beginTransaction();

            const graph = manager.getCurrentGraph();
            expect(graph.nodes).toHaveLength(2);
        });
    });

    describe('isInTransaction()', () => {
        it('should return false initially', () => {
            expect(manager.isInTransaction()).toBe(false);
        });

        it('should return true during transaction', async () => {
            await manager.beginTransaction();

            expect(manager.isInTransaction()).toBe(true);
        });

        it('should return false after commit', async () => {
            await manager.beginTransaction();
            await manager.commit();

            expect(manager.isInTransaction()).toBe(false);
        });

        it('should return false after rollback', async () => {
            await manager.beginTransaction();
            await manager.rollback();

            expect(manager.isInTransaction()).toBe(false);
        });
    });

    describe('withTransaction()', () => {
        it('should execute operation within transaction', async () => {
            const operation = vi.fn(async () => 'result');

            const result = await manager.withTransaction(operation);

            expect(result).toBe('result');
            expect(operation).toHaveBeenCalled();
            expect(manager.isInTransaction()).toBe(false);
        });

        it('should commit on successful operation', async () => {
            const emitSpy = vi.spyOn(manager, 'emit');

            await manager.withTransaction(async () => {
                return 'success';
            });

            expect(emitSpy).toHaveBeenCalledWith('afterCommit', {});
        });

        it('should rollback on operation failure', async () => {
            const rollbackAction = vi.fn();
            const emitSpy = vi.spyOn(manager, 'emit');

            try {
                await manager.withTransaction(async () => {
                    throw new Error('Operation failed');
                });
            } catch {
                // Expected
            }

            expect(emitSpy).toHaveBeenCalledWith('afterRollback', {});
        });

        it('should propagate operation errors', async () => {
            await expect(
                manager.withTransaction(async () => {
                    throw new Error('Operation error');
                })
            ).rejects.toThrow('Operation error');
        });

        it('should handle rollback actions within transaction', async () => {
            const rollbackAction = vi.fn();

            await manager.withTransaction(async () => {
                await manager.addRollbackAction(rollbackAction, 'cleanup');
                return 'done';
            });

            // On successful commit, rollback actions are cleared
            expect(rollbackAction).not.toHaveBeenCalled();
        });

        it('should execute rollback actions on failure', async () => {
            const rollbackAction = vi.fn();

            try {
                await manager.withTransaction(async () => {
                    await manager.addRollbackAction(rollbackAction, 'cleanup');
                    throw new Error('Failed');
                });
            } catch {
                // Expected
            }

            expect(rollbackAction).toHaveBeenCalled();
        });

        it('should return operation result', async () => {
            const result = await manager.withTransaction(async () => {
                return { data: 'test' };
            });

            expect(result).toEqual({ data: 'test' });
        });
    });

    describe('Transaction lifecycle', () => {
        it('should handle complete transaction cycle', async () => {
            expect(manager.isInTransaction()).toBe(false);

            await manager.beginTransaction();
            expect(manager.isInTransaction()).toBe(true);

            const graph = manager.getCurrentGraph();
            expect(graph).toBeDefined();

            await manager.commit();
            expect(manager.isInTransaction()).toBe(false);
        });

        it('should handle transaction with rollback cycle', async () => {
            await manager.beginTransaction();
            const rollbackFn = vi.fn();
            await manager.addRollbackAction(rollbackFn, 'cleanup');

            await manager.rollback();

            expect(rollbackFn).toHaveBeenCalled();
            expect(manager.isInTransaction()).toBe(false);
        });

        it('should handle nested withTransaction calls via sequential execution', async () => {
            const result1 = await manager.withTransaction(async () => {
                return 'first';
            });

            const result2 = await manager.withTransaction(async () => {
                return 'second';
            });

            expect(result1).toBe('first');
            expect(result2).toBe('second');
        });
    });

    describe('Error handling', () => {
        it('should handle storage errors during beginTransaction', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue(new Error('Storage error'));

            await expect(manager.beginTransaction()).rejects.toThrow('Failed to begin transaction');
        });

        it('should handle non-Error exceptions', async () => {
            mockStorage.loadGraph = vi.fn().mockRejectedValue('string error');

            await expect(manager.beginTransaction()).rejects.toThrow();
        });

        it('should continue rollback despite action failures', async () => {
            await manager.beginTransaction();

            const failingAction = vi.fn().mockRejectedValue(new Error('Fail'));
            const successAction = vi.fn().mockResolvedValue(undefined);

            await manager.addRollbackAction(failingAction, 'fail');
            await manager.addRollbackAction(successAction, 'ok');

            await manager.rollback();

            expect(failingAction).toHaveBeenCalled();
            expect(successAction).toHaveBeenCalled();
        });
    });
});
