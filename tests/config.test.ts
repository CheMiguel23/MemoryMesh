import path from 'path';
import {describe, expect, it} from 'vitest';
import {resolveMemoryFile} from '../src/config.js';

const buildDir = path.resolve('/app/dist');
const homeDir = path.resolve('/home/someone');
const legacy = path.join(buildDir, 'data', 'memory.json');
const safe = path.join(homeDir, '.memorymesh', 'memory.json');

describe('resolveMemoryFile', () => {
    it('defaults to the home folder, outside the build output', () => {
        const result = resolveMemoryFile({env: '', buildDir, homeDir, exists: () => false});
        expect(result).toEqual({file: safe, inBuildOutput: false, safeDefault: safe});
    });

    it('keeps using a memory file that already exists in the build output, and flags it', () => {
        const result = resolveMemoryFile({env: '', buildDir, homeDir, exists: file => file === legacy});
        expect(result).toEqual({file: legacy, inBuildOutput: true, safeDefault: safe});
    });

    it('lets MEMORYMESH_MEMORY_FILE override everything', () => {
        const result = resolveMemoryFile({env: 'custom/memory.json', buildDir, homeDir, exists: () => true});
        expect(result).toEqual({file: path.resolve('custom/memory.json'), inBuildOutput: false, safeDefault: safe});
    });
});
