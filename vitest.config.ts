import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: {
        target: 'es2022',
        keepNames: true,
    },
    test: {
        globals: true,
        restoreMocks: true,
        testTimeout: 60_000,
        hookTimeout: 60_000,
        include: [
            '**/*.{test,spec}.?(c|m)[jt]s?(x)',
            'test/**/*.js',
        ],
        // Needed because of chdir
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        passWithNoTests: true,
        silent: !process.env.NO_SILENT_TESTS,
    },
});
