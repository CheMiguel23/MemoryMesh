import {watch, type FSWatcher} from 'fs';

/**
 * Calls `onChange` shortly after anything in `dir` changes.
 *
 * Saving a file usually produces several events in a row (and some editors write
 * a temporary file first), so a burst of events is reported once, after it ends.
 * Returns undefined, after logging why, when the directory cannot be watched.
 */
export function watchDirectory(dir: string, onChange: () => void, delayMs = 300): FSWatcher | undefined {
    try {
        let timer: NodeJS.Timeout | undefined;
        const watcher = watch(dir, () => {
            clearTimeout(timer);
            timer = setTimeout(onChange, delayMs);
        });
        watcher.on('error', error => {
            console.error(`[memorymesh] Stopped watching ${dir}: ${error.message}`);
            watcher.close();
        });
        // Watching must not keep the process alive once the client has disconnected.
        watcher.unref();
        return watcher;
    } catch (error) {
        console.error(`[memorymesh] Not watching ${dir} for changes: ${(error as Error).message}`);
        return undefined;
    }
}
