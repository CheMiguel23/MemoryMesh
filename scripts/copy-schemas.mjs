// Copies the bundled example schemas into dist/data/schemas after a build.
//
// Existing files are never overwritten, so rebuilding or updating MemoryMesh
// keeps any schema you edited in dist/. The memory file is never touched.

import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'src', 'data', 'schemas');
const to = path.join(root, 'dist', 'data', 'schemas');

mkdirSync(to, {recursive: true});
for (const file of readdirSync(from).filter(f => f.endsWith('.schema.json'))) {
    const target = path.join(to, file);
    if (!existsSync(target)) copyFileSync(path.join(from, file), target);
}

chmodSync(path.join(root, 'dist', 'index.js'), 0o755);
