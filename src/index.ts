#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CONFIG} from './config.js';
import {convertNotesToFields, loadSchemas, type EntitySchema} from './schemas.js';
import {createServer} from './server.js';
import {GraphStore} from './store.js';

/** Where the memory file is copied to before it is converted from the pre-0.7 format. */
const BACKUP_SUFFIX = '.before-fields.bak';

/**
 * Memory written by older versions kept schema fields as "key: value" notes.
 * They are moved into structured fields once; the original file is kept as a backup.
 * A problem here must not stop the server: the tools report it when they are used.
 */
async function upgradeMemoryFile(store: GraphStore, schemas: EntitySchema[]): Promise<void> {
    try {
        const converted = await store.migrate(graph => convertNotesToFields(graph, schemas), BACKUP_SUFFIX);
        if (converted > 0) {
            console.error(
                `[memorymesh] Converted ${converted} node(s) to structured fields. ` +
                `The memory file as it was is kept in ${store.file}${BACKUP_SUFFIX}`
            );
        }
    } catch (error) {
        console.error(`[memorymesh] Could not check the memory file format: ${(error as Error).message}`);
    }
}

async function main(): Promise<void> {
    const schemas = await loadSchemas(CONFIG.schemasDir);
    const store = new GraphStore(CONFIG.memoryFile);
    await upgradeMemoryFile(store, schemas);
    const server = createServer(store, schemas);
    server.onerror = error => console.error('[memorymesh]', error);

    await server.connect(new StdioServerTransport());

    // Logs go to stderr: stdout is reserved for the MCP protocol.
    console.error(`[memorymesh] v${CONFIG.version} running on stdio`);
    console.error(`[memorymesh] memory file: ${CONFIG.memoryFile}`);
    if (CONFIG.memoryFileInBuildOutput) {
        console.error(
            '[memorymesh] WARNING: this memory file is inside the build folder (dist/), so deleting or cleaning ' +
            `dist/ deletes your memory. Stop MemoryMesh and move the file to ${CONFIG.defaultMemoryFile} ` +
            '(the default location), or anywhere else with MEMORYMESH_MEMORY_FILE set to the new path.'
        );
    }
    console.error(`[memorymesh] schemas: ${schemas.map(s => s.entity).join(', ') || '(none)'} from ${CONFIG.schemasDir}`);
}

main().catch(error => {
    console.error('[memorymesh] Fatal error:', error);
    process.exit(1);
});
