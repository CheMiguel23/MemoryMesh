import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from '../../../src/infrastructure/events/EventEmitter.js';
import type { EventListener } from '../../../src/infrastructure/events/EventTypes.js';

describe('EventEmitter', () => {
    let emitter: EventEmitter;

    beforeEach(() => {
        emitter = new EventEmitter();
    });

    describe('on() - Add event listener', () => {
        it('should add a listener for an event', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            expect(emitter.listenerCount('test')).toBe(1);
        });

        it('should add multiple listeners for the same event', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            expect(emitter.listenerCount('test')).toBe(2);
        });

        it('should return an unsubscribe function', () => {
            const listener: EventListener = vi.fn();
            const unsubscribe = emitter.on('test', listener);

            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should throw TypeError if listener is not a function', () => {
            expect(() => {
                emitter.on('test', 'not a function' as any);
            }).toThrow(TypeError);
        });

        it('should maintain listener references across multiple events', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('event1', listener1);
            emitter.on('event2', listener2);

            expect(emitter.listenerCount('event1')).toBe(1);
            expect(emitter.listenerCount('event2')).toBe(1);
        });
    });

    describe('off() - Remove event listener', () => {
        it('should remove a specific listener', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);
            emitter.off('test', listener);

            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should only remove the specified listener', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);
            emitter.off('test', listener1);

            expect(emitter.listenerCount('test')).toBe(1);
            expect(emitter.getListeners('test')[0]).toBe(listener2);
        });

        it('should clean up empty listener sets', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);
            emitter.off('test', listener);

            expect(emitter.eventNames()).not.toContain('test');
        });

        it('should throw TypeError if listener is not a function', () => {
            expect(() => {
                emitter.off('test', 'not a function' as any);
            }).toThrow(TypeError);
        });

        it('should not throw if removing a non-existent listener', () => {
            const listener: EventListener = vi.fn();
            expect(() => {
                emitter.off('test', listener);
            }).not.toThrow();
        });
    });

    describe('once() - One-time event listener', () => {
        it('should add a listener that fires only once', () => {
            const listener: EventListener = vi.fn();
            emitter.once('test', listener);

            emitter.emit('test', { data: 'first' });
            emitter.emit('test', { data: 'second' });

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ data: 'first' });
        });

        it('should return an unsubscribe function', () => {
            const listener: EventListener = vi.fn();
            const unsubscribe = emitter.once('test', listener);

            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
            emitter.emit('test', {});

            expect(listener).not.toHaveBeenCalled();
        });

        it('should throw TypeError if listener is not a function', () => {
            expect(() => {
                emitter.once('test', 'not a function' as any);
            }).toThrow(TypeError);
        });

        it('should auto-remove after single emission', () => {
            const listener: EventListener = vi.fn();
            emitter.once('test', listener);

            expect(emitter.listenerCount('test')).toBe(1);
            emitter.emit('test', {});
            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should work alongside regular listeners', () => {
            const regularListener: EventListener = vi.fn();
            const onceListener: EventListener = vi.fn();

            emitter.on('test', regularListener);
            emitter.once('test', onceListener);

            emitter.emit('test', { data: 'first' });
            emitter.emit('test', { data: 'second' });

            expect(regularListener).toHaveBeenCalledTimes(2);
            expect(onceListener).toHaveBeenCalledTimes(1);
        });
    });

    describe('emit() - Fire events', () => {
        it('should call all listeners for an event', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            emitter.emit('test', { data: 'value' });

            expect(listener1).toHaveBeenCalledWith({ data: 'value' });
            expect(listener2).toHaveBeenCalledWith({ data: 'value' });
        });

        it('should return true if listeners were called', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            const result = emitter.emit('test', {});

            expect(result).toBe(true);
        });

        it('should return false if no listeners exist for the event', () => {
            const result = emitter.emit('nonexistent', {});

            expect(result).toBe(false);
        });

        it('should emit events with undefined data', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            emitter.emit('test');

            expect(listener).toHaveBeenCalledWith(undefined);
        });

        it('should emit events with various data types', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            // String
            emitter.emit('test', 'string data');
            expect(listener).toHaveBeenNthCalledWith(1, 'string data');

            // Number
            emitter.emit('test', 42);
            expect(listener).toHaveBeenNthCalledWith(2, 42);

            // Object
            emitter.emit('test', { key: 'value' });
            expect(listener).toHaveBeenNthCalledWith(3, { key: 'value' });

            // Array
            emitter.emit('test', [1, 2, 3]);
            expect(listener).toHaveBeenNthCalledWith(4, [1, 2, 3]);
        });

        it('should propagate errors from listeners as aggregated error', () => {
            const errorListener: EventListener = () => {
                throw new Error('Listener error');
            };
            const okListener: EventListener = vi.fn();

            emitter.on('test', errorListener);
            emitter.on('test', okListener);

            expect(() => {
                emitter.emit('test', {});
            }).toThrow('Multiple errors occurred');

            expect(okListener).toHaveBeenCalled();
        });

        it('should handle non-Error exceptions from listeners', () => {
            const errorListener: EventListener = () => {
                throw 'string error'; // Non-Error throw
            };

            emitter.on('test', errorListener);

            expect(() => {
                emitter.emit('test', {});
            }).toThrow('Multiple errors occurred');
        });
    });

    describe('removeAllListeners() - Clear all listeners', () => {
        it('should remove all listeners for a specific event', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            emitter.removeAllListeners('test');

            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should remove all listeners for all events', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('event1', listener1);
            emitter.on('event2', listener2);

            emitter.removeAllListeners();

            expect(emitter.listenerCount('event1')).toBe(0);
            expect(emitter.listenerCount('event2')).toBe(0);
            expect(emitter.eventNames()).toHaveLength(0);
        });

        it('should be safe to call on non-existent events', () => {
            expect(() => {
                emitter.removeAllListeners('nonexistent');
            }).not.toThrow();
        });
    });

    describe('listenerCount() - Get listener count', () => {
        it('should return the count of listeners for an event', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            expect(emitter.listenerCount('test')).toBe(2);
        });

        it('should return 0 for non-existent events', () => {
            expect(emitter.listenerCount('nonexistent')).toBe(0);
        });
    });

    describe('eventNames() - Get all event names', () => {
        it('should return all registered event names', () => {
            const listener: EventListener = vi.fn();

            emitter.on('event1', listener);
            emitter.on('event2', listener);
            emitter.on('event3', listener);

            const names = emitter.eventNames();

            expect(names).toContain('event1');
            expect(names).toContain('event2');
            expect(names).toContain('event3');
            expect(names).toHaveLength(3);
        });

        it('should return empty array when no events are registered', () => {
            expect(emitter.eventNames()).toHaveLength(0);
        });

        it('should not include events after all listeners are removed', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);
            emitter.removeAllListeners('test');

            expect(emitter.eventNames()).not.toContain('test');
        });
    });

    describe('getListeners() - Get listeners for an event', () => {
        it('should return all listeners for an event', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            const listeners = emitter.getListeners('test');

            expect(listeners).toContain(listener1);
            expect(listeners).toContain(listener2);
            expect(listeners).toHaveLength(2);
        });

        it('should return empty array for non-existent events', () => {
            expect(emitter.getListeners('nonexistent')).toHaveLength(0);
        });

        it('should return a copy of listeners array', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            const listeners1 = emitter.getListeners('test');
            const listeners2 = emitter.getListeners('test');

            expect(listeners1).not.toBe(listeners2); // Different array instances
            expect(listeners1).toEqual(listeners2); // But same content
        });
    });

    describe('Integration - Complex event scenarios', () => {
        it('should handle rapid event emissions', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            for (let i = 0; i < 100; i++) {
                emitter.emit('test', { iteration: i });
            }

            expect(listener).toHaveBeenCalledTimes(100);
        });

        it('should handle listeners adding/removing themselves', () => {
            const listener1: EventListener = vi.fn();
            const listener2 = vi.fn(function(this: any) {
                emitter.off('test', listener2);
            });

            emitter.on('test', listener1);
            emitter.on('test', listener2);

            emitter.emit('test', {});
            expect(emitter.listenerCount('test')).toBe(1);
        });

        it('should maintain isolation between different event names', () => {
            const listener1: EventListener = vi.fn();
            const listener2: EventListener = vi.fn();

            emitter.on('event1', listener1);
            emitter.on('event2', listener2);

            emitter.emit('event1', { data: 'test' });

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).not.toHaveBeenCalled();
        });

        it('should handle deeply nested event structures', () => {
            const listener: EventListener = vi.fn();
            emitter.on('test', listener);

            const complexData = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep'
                        }
                    }
                }
            };

            emitter.emit('test', complexData);

            expect(listener).toHaveBeenCalledWith(complexData);
        });
    });

    describe('Method binding', () => {
        it('should preserve context when methods are called as callbacks', () => {
            const listener: EventListener = vi.fn();
            const { on, emit } = emitter;

            on('test', listener);
            emit('test', {});

            expect(listener).toHaveBeenCalled();
        });
    });
});
