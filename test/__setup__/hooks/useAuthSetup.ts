import { rm } from 'node:fs/promises';
import { EOL } from 'node:os';

import isCI from 'is-ci';

import { cryptoRandomObjectId } from '@apify/utilities';

import { LoginCommand } from '../../../src/commands/login.js';
import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import { getLocalUserInfo } from '../../../src/lib/utils.js';
import { TEST_USER_TOKEN } from '../config.js';

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
export function useAuthSetup({ cleanup, perTest }: UseAuthSetupOptions = { cleanup: true, perTest: true }) {
	const random = cryptoRandomObjectId(12);

	const envValue = () => (perTest ? cryptoRandomObjectId(12) : random);

	const before = perTest ? beforeEach : beforeAll;
	const after = perTest ? afterEach : afterAll;

	before(() => {
		vitest.stubEnv(envVariable, envValue());
	});

	after(async () => {
		if (cleanup) {
			await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		}

		vitest.unstubAllEnvs();
	});
}

export async function safeLogin(tokenOverride?: string) {
	// eslint-disable-next-line no-restricted-syntax -- The only place we should run this is here
	await runCommand(LoginCommand, { flags_token: tokenOverride ?? TEST_USER_TOKEN });

	try {
		const userInfo = await getLocalUserInfo();

		if (userInfo?.proxy?.password && isCI) {
			process.stdout.write(`${EOL}::add-mask::${userInfo.proxy.password}${EOL}`);
		}
	} catch {
		// Do nothing
	}
}
