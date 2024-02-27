import { rm } from 'node:fs/promises';

import { cryptoRandomObjectId } from '@apify/utilities';

import { GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';

export interface UseAuthSetupOptions {
    /**
     * If true, the created auth data will be automatically removed after the test suite.
     * @default true
     */
    cleanup?: boolean;
    /**
     * If true, there will be a new auth state per test instead of per suite.
     * @default true
     */
    perTest?: boolean;
}

// Keep in sync with GLOBAL_CONFIGS_FOLDER in consts.ts
const envVariable = '__APIFY_INTERNAL_TEST_AUTH_PATH__';

/**
 * A hook that allows each test to have a unique auth setup.
 */
export function useAuthSetup({
    cleanup,
    perTest,
}: UseAuthSetupOptions = { cleanup: true, perTest: true }) {
    const random = cryptoRandomObjectId(12);

    const before = perTest ? beforeEach : beforeAll;
    const after = perTest ? afterEach : afterAll;

    before(() => {
        vitest.stubEnv(envVariable, random);
    });

    after(async () => {
        if (cleanup) {
            await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
        }

        vitest.unstubAllEnvs();
    });
}
