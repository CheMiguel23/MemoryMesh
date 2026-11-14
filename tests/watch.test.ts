import {mkdtempSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {watchDirectory} from '../src/watch.js';

const closers: (() => void)[] = [];
afterEach(() => {
    closers.splice(0).forEach(close => close());
    vi.restoreAllMocks();
});

const waitFor = async (condition: () => boolean, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
};

describe('watchDirectory', () => {
    it('reports a burst of changes once', async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'memorymesh-watch-'));
        let calls = 0;
        const watcher = watchDirectory(dir, () => calls++, 100);
        expect(watcher).toBeDefined();
        closers.push(() => watcher!.close());

        writeFileSync(path.join(dir, 'a.schema.json'), '{}');
        writeFileSync(path.join(dir, 'a.schema.json'), '{"name":"add_a"}');
        writeFileSync(path.join(dir, 'b.schema.json'), '{}');
        await waitFor(() => calls > 0);
        await new Promise(resolve => setTimeout(resolve, 250));
        expect(calls).toBe(1);

        writeFileSync(path.join(dir, 'b.schema.json'), '{"name":"add_b"}');
        await waitFor(() => calls > 1);
        expect(calls).toBe(2);
    });

    it('logs and carries on when the directory cannot be watched', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(watchDirectory(path.join(tmpdir(), 'memorymesh-does-not-exist'), () => undefined)).toBeUndefined();
        expect(log.mock.calls[0][0]).toContain('Not watching');
    });
});
