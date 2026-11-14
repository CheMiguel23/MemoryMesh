import {existsSync, readFileSync} from 'fs';
import {homedir} from 'os';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf-8'));

/** Resolves an optional path from the environment, falling back to a default. */
const fromEnv = (name: string, fallback: string) =>
    process.env[name] ? path.resolve(process.env[name]!) : fallback;

/**
 * Picks the memory file:
 *   1. MEMORYMESH_MEMORY_FILE, when set.
 *   2. The old default inside the build output (dist/data/memory.json), when a
 *      file is already there. It keeps being used so existing installs find their
 *      memory, but `inBuildOutput` is set so the user can be told to move it.
 *   3. ~/.memorymesh/memory.json, which rebuilding or deleting dist/ cannot touch.
 */
export function resolveMemoryFile(options: {
    env?: string;
    buildDir?: string;
    homeDir?: string;
    exists?: (file: string) => boolean;
} = {}): { file: string; inBuildOutput: boolean; safeDefault: string } {
    const {
        env = process.env.MEMORYMESH_MEMORY_FILE,
        buildDir = here,
        homeDir = homedir(),
        exists = existsSync,
    } = options;

    const safeDefault = path.join(homeDir, '.memorymesh', 'memory.json');
    if (env) return {file: path.resolve(env), inBuildOutput: false, safeDefault};
    const legacy = path.join(buildDir, 'data', 'memory.json');
    if (exists(legacy)) return {file: legacy, inBuildOutput: true, safeDefault};
    return {file: safeDefault, inBuildOutput: false, safeDefault};
}

const memory = resolveMemoryFile();

export const CONFIG = {
    name: 'memorymesh',
    version: pkg.version as string,

    /** Directory containing *.schema.json files. Override with MEMORYMESH_SCHEMAS_DIR. */
    schemasDir: fromEnv('MEMORYMESH_SCHEMAS_DIR', path.join(here, 'data', 'schemas')),

    /** The JSON Lines file the graph is stored in. Override with MEMORYMESH_MEMORY_FILE. */
    memoryFile: memory.file,

    /** True when the memory file is the old default inside dist/, which a clean rebuild deletes. */
    memoryFileInBuildOutput: memory.inBuildOutput,

    /** Where the memory file goes when nothing else is configured. */
    defaultMemoryFile: memory.safeDefault,
};
