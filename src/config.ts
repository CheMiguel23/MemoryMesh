import {readFileSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf-8'));

/** Resolves an optional path from the environment, falling back to a default. */
const fromEnv = (name: string, fallback: string) =>
    process.env[name] ? path.resolve(process.env[name]!) : fallback;

export const CONFIG = {
    name: 'memorymesh',
    version: pkg.version as string,

    /** Directory containing *.schema.json files. Override with MEMORYMESH_SCHEMAS_DIR. */
    schemasDir: fromEnv('MEMORYMESH_SCHEMAS_DIR', path.join(here, 'data', 'schemas')),

    /** The JSON Lines file the graph is stored in. Override with MEMORYMESH_MEMORY_FILE. */
    memoryFile: fromEnv('MEMORYMESH_MEMORY_FILE', path.join(here, 'data', 'memory.json')),
};
