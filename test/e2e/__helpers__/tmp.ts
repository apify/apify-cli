import { fileURLToPath } from 'node:url';

/** Absolute path to the repo-root `tmp/` directory used by e2e tests for scratch files. */
export const TestTmpRoot = fileURLToPath(new URL('../../../tmp/', import.meta.url));
