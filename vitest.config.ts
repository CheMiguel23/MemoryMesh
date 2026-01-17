import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/**/*.d.ts']
        },
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@core': path.resolve(__dirname, './src/core'),
            '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
            '@application': path.resolve(__dirname, './src/application'),
            '@integration': path.resolve(__dirname, './src/integration'),
            '@shared': path.resolve(__dirname, './src/shared'),
            '@data': path.resolve(__dirname, './src/data'),
            '@config': path.resolve(__dirname, './src/config'),
        },
    },
});
