#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CONFIG} from './config.js';
import {loadSchemas} from './schemas.js';
import {createServer} from './server.js';
import {GraphStore} from './store.js';

async function main(): Promise<void> {
    const schemas = await loadSchemas(CONFIG.schemasDir);
    const server = createServer(new GraphStore(CONFIG.memoryFile), schemas);
    server.onerror = error => console.error('[memorymesh]', error);

    await server.connect(new StdioServerTransport());

    // Logs go to stderr: stdout is reserved for the MCP protocol.
    console.error(`[memorymesh] v${CONFIG.version} running on stdio`);
    console.error(`[memorymesh] memory file: ${CONFIG.memoryFile}`);
    console.error(`[memorymesh] schemas: ${schemas.map(s => s.entity).join(', ') || '(none)'} from ${CONFIG.schemasDir}`);
}

main().catch(error => {
    console.error('[memorymesh] Fatal error:', error);
    process.exit(1);
});
