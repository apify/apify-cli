import { rm } from 'node:fs/promises';
import { EOL } from 'node:os';

import { isCI } from 'ci-info';

import { cryptoRandomObjectId } from '@apify/utilities';

import { LoginCommand } from '../../../src/commands/login.js';
import { __resetAuthNoticesForTests } from '../../../src/lib/auth.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import { __resetCredentialsForTests } from '../../../src/lib/credentials.js';
import { __resetUserInfoCacheForTests, getLocalUserInfo } from '../../../src/lib/utils.js';

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
export function useAuthSetup({ cleanup = true, perTest = true }: UseAuthSetupOptions = {}) {
	const random = cryptoRandomObjectId(12);

	const envValue = () => (perTest ? cryptoRandomObjectId(12) : random);

	const before = perTest ? beforeEach : beforeAll;
	const after = perTest ? afterEach : afterAll;

	before(() => {
		vitest.stubEnv(envVariable, envValue());
		// Tests pin to the file backend so they don't touch the real OS keyring.
		// Unit tests for credentials.ts override this explicitly.
		vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
		// The resolver reads APIFY_TOKEN, so a token in the developer's shell would leak into tests.
		vitest.stubEnv('APIFY_TOKEN', '');
		__resetCredentialsForTests();
		__resetUserInfoCacheForTests();
		__resetAuthNoticesForTests();
	});

	after(async () => {
		if (cleanup) {
			await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		}

		__resetCredentialsForTests();
		__resetUserInfoCacheForTests();
		__resetAuthNoticesForTests();
		vitest.unstubAllEnvs();
	});
}

/**
 * Switches the enclosing `describe` to the keyring backend, which {@link useAuthSetup} pins off.
 * Throws unless the file mocks `@napi-rs/keyring` with `test/__setup__/keyring-mock.ts`.
 */
export function useKeyringBackend() {
	beforeEach(async () => {
		const keyring = await import('@napi-rs/keyring').catch(() => null);
		if (!keyring || !('resetKeyringMock' in keyring)) {
			throw new Error(
				"useKeyringBackend() would write to the real OS keyring. Add vi.mock('@napi-rs/keyring', () => import('<path>/keyring-mock.js')) to this file.",
			);
		}

		vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		__resetCredentialsForTests();
		__resetUserInfoCacheForTests();
		__resetAuthNoticesForTests();
	});
}

export async function safeLogin(tokenOverride?: string) {
	const { TEST_USER_TOKEN } = await import('../config.js');

	// eslint-disable-next-line no-restricted-syntax -- The only place we should run this is here
	await testRunCommand(LoginCommand, { flags_token: tokenOverride ?? TEST_USER_TOKEN });

	try {
		const userInfo = await getLocalUserInfo();

		if (userInfo?.proxy?.password && isCI) {
			process.stdout.write(`${EOL}::add-mask::${userInfo.proxy.password}${EOL}`);
		}
	} catch {
		// Do nothing
	}
}
