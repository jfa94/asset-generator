import {defineConfig} from 'vitest/config'
import path from 'path'

export default defineConfig({
    // tsconfig uses jsx:preserve for Next; vitest needs oxc to transform it
    oxc: {jsx: {runtime: 'automatic'}},
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            enabled: true,
            reporter: ['text', 'text-summary', 'json', 'json-summary', 'html'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'src/**/*.d.ts',
                'src/**/types/**',
                'src/**/index.ts',
                'src/**/__mocks__/**',
                // React UI shell only: thin presentation over tested lib/domain; server .ts (actions, routes) stays covered
                'src/app/**/*.tsx',
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 75,
                statements: 80,
                perFile: true,
            },
            reportOnFailure: true,
        },
        isolate: true,
        testTimeout: 10000,
        hookTimeout: 10000,
    },
    resolve: {
        alias: {'@': path.resolve(__dirname, './src')},
    },
})
