import {promises as fs} from 'fs';
import path from 'path';
import type {Edge, Graph, Node} from './types.js';

const isString = (value: unknown): value is string => typeof value === 'string';

/** Returns the record as a node if it is one, filling in a missing metadata list. */
function asNode(item: any): Node | undefined {
    if (item?.type !== 'node' || !isString(item.name) || !isString(item.nodeType)) return undefined;
    const metadata = Array.isArray(item.metadata)
        ? item.metadata.map((entry: unknown) => (isString(entry) ? entry : JSON.stringify(entry)))
        : [];
    return {...item, metadata};
}

/** Returns the record as an edge if it is one. */
function asEdge(item: any): Edge | undefined {
    if (item?.type !== 'edge' || !isString(item.from) || !isString(item.to) || !isString(item.edgeType)) {
        return undefined;
    }
    return item;
}

/**
 * Persists the graph as a JSON Lines file: one node or edge per line.
 *
 * Every read/update loads the file fresh, and calls are queued so that two
 * tool calls arriving at the same time cannot overwrite each other's changes.
 *
 * Lines that are valid JSON but not a well-formed node or edge (for example
 * records written by another tool, or a hand-edited node without a name) are
 * not part of the graph, but are kept as they are whenever the file is rewritten.
 */
export interface GraphStoreOptions {
    /** How long to wait for another process to finish writing before giving up. */
    lockWaitMs?: number;
    /** A lock file older than this was left behind by a process that died, and is ignored. */
    lockStaleMs?: number;
}

const LOCK_RETRY_MS = 20;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GraphStore {
    private queue: Promise<unknown> = Promise.resolve();
    private warnedAboutOtherLines = false;
    private readonly lockFile: string;
    private readonly lockWaitMs: number;
    private readonly lockStaleMs: number;

    constructor(readonly file: string, options: GraphStoreOptions = {}) {
        this.lockFile = `${file}.lock`;
        this.lockWaitMs = options.lockWaitMs ?? 15_000;
        this.lockStaleMs = options.lockStaleMs ?? 10_000;
    }

    /** Returns the current graph. */
    read(): Promise<Graph> {
        return this.enqueue(async () => (await this.load()).graph);
    }

    /**
     * Loads the graph, lets `change` modify it, and saves the result.
     * If `change` throws, nothing is written - the call is all-or-nothing.
     */
    update<T>(change: (graph: Graph) => T): Promise<T> {
        return this.enqueue(() => this.withLock(async () => {
            const {graph, otherLines} = await this.load();
            const result = change(graph);
            await this.save(graph, otherLines);
            return result;
        }));
    }

    /**
     * Runs `task` while holding a lock file next to the memory file, so that two
     * MemoryMesh processes sharing one memory file (for example two MCP clients)
     * cannot both load the graph and then overwrite each other's changes.
     * Reading needs no lock: the file is always replaced in one step.
     */
    private async withLock<T>(task: () => Promise<T>): Promise<T> {
        await fs.mkdir(path.dirname(this.file), {recursive: true});
        const deadline = Date.now() + this.lockWaitMs;
        for (; ;) {
            try {
                await (await fs.open(this.lockFile, 'wx')).close();
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            }
            // Someone else holds the lock. A write takes milliseconds, so an old lock means its owner died.
            const age = await fs.stat(this.lockFile).then(stat => Date.now() - stat.mtimeMs, () => 0);
            if (age > this.lockStaleMs) {
                await fs.rm(this.lockFile, {force: true});
            } else if (Date.now() > deadline) {
                throw new Error(
                    `Memory file ${this.file} is in use by another MemoryMesh process. Try again in a moment. ` +
                    `If no other MemoryMesh is running, delete ${this.lockFile}.`
                );
            } else {
                await sleep(LOCK_RETRY_MS);
            }
        }
        try {
            return await task();
        } finally {
            await fs.rm(this.lockFile, {force: true});
        }
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async load(): Promise<{ graph: Graph; otherLines: string[] }> {
        let text: string;
        try {
            text = await fs.readFile(this.file, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {graph: {nodes: [], edges: []}, otherLines: []};
            }
            throw error;
        }

        const graph: Graph = {nodes: [], edges: []};
        const otherLines: string[] = [];
        text.split('\n').forEach((line, index) => {
            if (line.trim() === '') return;
            let item;
            try {
                item = JSON.parse(line);
            } catch {
                // Refuse to continue rather than silently dropping the line on the next save.
                throw new Error(
                    `Memory file ${this.file} has invalid JSON on line ${index + 1}. ` +
                    `Fix or remove that line, then try again.`
                );
            }
            const node = asNode(item);
            const edge = node ? undefined : asEdge(item);
            if (node) graph.nodes.push(node);
            else if (edge) graph.edges.push(edge);
            else otherLines.push(line.trim());
        });

        if (otherLines.length > 0 && !this.warnedAboutOtherLines) {
            this.warnedAboutOtherLines = true;
            console.error(
                `[memorymesh] ${this.file} has ${otherLines.length} line(s) that are not a valid node or edge. ` +
                `They are not part of the graph, and are kept unchanged.`
            );
        }
        return {graph, otherLines};
    }

    private async save(graph: Graph, otherLines: string[]): Promise<void> {
        const lines = [
            ...graph.nodes.map(node => JSON.stringify({...node, type: 'node'})),
            ...graph.edges.map(edge => JSON.stringify({...edge, type: 'edge'})),
            ...otherLines,
        ];
        const text = lines.length > 0 ? lines.join('\n') + '\n' : '';

        // Write to a temporary file and rename it over the original, so a crash
        // mid-write can never leave a half-written memory file behind.
        const temp = `${this.file}.${process.pid}.tmp`;
        await fs.writeFile(temp, text, 'utf-8');
        await fs.rename(temp, this.file);
    }
}
