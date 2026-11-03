import {promises as fs} from 'fs';
import path from 'path';
import type {Graph} from './types.js';

/**
 * Persists the graph as a JSON Lines file: one node or edge per line.
 *
 * Every read/update loads the file fresh, and calls are queued so that two
 * tool calls arriving at the same time cannot overwrite each other's changes.
 */
export class GraphStore {
    private queue: Promise<unknown> = Promise.resolve();

    constructor(readonly file: string) {
    }

    /** Returns the current graph. */
    read(): Promise<Graph> {
        return this.enqueue(() => this.load());
    }

    /**
     * Loads the graph, lets `change` modify it, and saves the result.
     * If `change` throws, nothing is written - the call is all-or-nothing.
     */
    update<T>(change: (graph: Graph) => T): Promise<T> {
        return this.enqueue(async () => {
            const graph = await this.load();
            const result = change(graph);
            await this.save(graph);
            return result;
        });
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async load(): Promise<Graph> {
        let text: string;
        try {
            text = await fs.readFile(this.file, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {nodes: [], edges: []};
            }
            throw error;
        }

        const graph: Graph = {nodes: [], edges: []};
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
            if (item?.type === 'node') graph.nodes.push(item);
            else if (item?.type === 'edge') graph.edges.push(item);
        });
        return graph;
    }

    private async save(graph: Graph): Promise<void> {
        const lines = [
            ...graph.nodes.map(node => JSON.stringify({...node, type: 'node'})),
            ...graph.edges.map(edge => JSON.stringify({...edge, type: 'edge'})),
        ];
        const text = lines.length > 0 ? lines.join('\n') + '\n' : '';

        // Write to a temporary file and rename it over the original, so a crash
        // mid-write can never leave a half-written memory file behind.
        await fs.mkdir(path.dirname(this.file), {recursive: true});
        const temp = `${this.file}.${process.pid}.tmp`;
        await fs.writeFile(temp, text, 'utf-8');
        await fs.rename(temp, this.file);
    }
}
