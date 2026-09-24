import { existsSync } from 'node:fs';

import { ApifyApiError } from 'apify-client';

import { loginWithToken, resolveAuth } from '../../../src/lib/auth.js';
import { AUTH_FILE_PATH, CommandExitCodes } from '../../../src/lib/consts.js';
import { getSecret } from '../../../src/lib/credentials.js';
import { getCurrentUserInfo, getLoggedClientOrThrow } from '../../../src/lib/utils.js';
import { clientState, resetApifyClientMock } from '../../__setup__/apify-client-mock.js';
import { readActiveProfile } from '../../__setup__/auth-file.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

vi.mock('apify-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('apify-client')>()),
	ApifyClient: (await import('../../__setup__/apify-client-mock.js')).FakeApifyClient,
}));

useAuthSetup();
const { lastErrorMessage, logMessages } = useConsoleSpy();

const STORED = 'apify_api_stored';
const ENV = 'apify_api_env';

// A real ApifyApiError, not a look-alike: describeAuthFailure narrows on the class, so a
// hand-built error would let the 401/403 branch rot without failing a test.
const apiError = (statusCode: number) =>
	new ApifyApiError(
		{ status: statusCode, data: { error: { message: 'nope' } }, config: {}, headers: {}, statusText: '' } as never,
		1,
	);

describe('auth', () => {
	beforeEach(() => {
		resetApifyClientMock({ id: 'uid', username: 'me', proxy: { password: 'pw' } });
	});

	describe('resolveAuth()', () => {
		afterEach(() => {
			// The command framework reads this; leaving it set would fail the vitest run.
			process.exitCode = 0;
		});

		it('returns undefined when no token is available', async () => {
			await expect(resolveAuth()).resolves.toBeUndefined();
		});

		it('resolves the stored login when nothing overrides it', async () => {
			await loginWithToken(STORED);

			await expect(resolveAuth()).resolves.toEqual({ token: STORED, source: 'stored' });
		});

		it('prefers APIFY_TOKEN over the stored login', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await expect(resolveAuth()).resolves.toEqual({ token: ENV, source: 'env' });
		});

		it.each(['undefined', 'null', 'NaN', 'none', '0', '-'])(
			'fails instead of falling back when APIFY_TOKEN is the placeholder %j',
			async (placeholder) => {
				await loginWithToken(STORED);
				vitest.stubEnv('APIFY_TOKEN', placeholder);

				await expect(resolveAuth()).rejects.toThrow(`APIFY_TOKEN is set to "${placeholder}"`);
				expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
			},
		);

		it('says how to fix a placeholder APIFY_TOKEN', async () => {
			vitest.stubEnv('APIFY_TOKEN', 'undefined');

			await expect(resolveAuth()).rejects.toThrow('Unset APIFY_TOKEN and try again');
		});

		it.each(['', '   '])(
			'falls back to the stored login without a word when APIFY_TOKEN is blank %j',
			async (blank) => {
				await loginWithToken(STORED);
				vitest.stubEnv('APIFY_TOKEN', blank);

				await expect(resolveAuth()).resolves.toEqual({ token: STORED, source: 'stored' });
				expect(lastErrorMessage()).toBeUndefined();
			},
		);

		it('trims surrounding whitespace off APIFY_TOKEN', async () => {
			vitest.stubEnv('APIFY_TOKEN', `  ${ENV}  `);

			await expect(resolveAuth()).resolves.toEqual({ token: ENV, source: 'env' });
		});

		it('says so when APIFY_TOKEN overrides a stored login', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await resolveAuth();

			expect(lastErrorMessage()).toContain('Using the API token from APIFY_TOKEN.');
		});

		it('says nothing when APIFY_TOKEN is the only credential', async () => {
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await resolveAuth();

			expect(lastErrorMessage()).toBeUndefined();
		});

		it('resolves once per process, so the notice is not repeated per caller', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await resolveAuth();
			await resolveAuth();
			await resolveAuth();

			expect(logMessages.error.filter((message) => message.includes('Using the API token'))).toHaveLength(1);
		});

		it('resolves APIFY_TOKEN with no stored login, as inside a platform run', async () => {
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await expect(resolveAuth()).resolves.toEqual({ token: ENV, source: 'env' });
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});
	});

	describe('loginWithToken()', () => {
		it('saves the token, the proxy password and the account metadata', async () => {
			await loginWithToken(STORED);

			expect(await getSecret('uid', 'token')).toBe(STORED);
			expect(await getSecret('uid', 'proxy-password')).toBe('pw');
			expect(readActiveProfile()).toMatchObject({ id: 'uid', username: 'me' });
		});

		it('writes nothing when the API rejects the token', async () => {
			clientState.fail = true;

			await expect(loginWithToken(STORED)).resolves.toBeNull();
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('ignores APIFY_TOKEN and saves the token it was given', async () => {
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await loginWithToken(STORED);

			expect(await getSecret('uid', 'token')).toBe(STORED);
		});
	});

	describe('getLoggedClientOrThrow()', () => {
		afterEach(() => {
			// The command framework reads this; leaving it set would fail the vitest run.
			process.exitCode = 0;
		});

		it('reports not being logged in when no token resolves', async () => {
			await expect(getLoggedClientOrThrow()).rejects.toThrow('You are not logged in');
		});

		it('names APIFY_TOKEN as the source of a rejected token', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);
			clientState.fail = true;
			clientState.failWith = apiError(401);

			await expect(getLoggedClientOrThrow()).rejects.toThrow(`The API token in APIFY_TOKEN was rejected`);
		});

		it('names the stored login as the source of a rejected token', async () => {
			await loginWithToken(STORED);
			clientState.fail = true;
			clientState.failWith = apiError(403);

			await expect(getLoggedClientOrThrow()).rejects.toThrow('Your stored API token was rejected');
		});

		it('does not blame the token when the API request itself failed', async () => {
			await loginWithToken(STORED);
			clientState.fail = true;
			clientState.failWith = new Error('getaddrinfo ENOTFOUND api.apify.com');

			await expect(getLoggedClientOrThrow()).rejects.toThrow('The Apify API request failed');
		});
	});

	describe('getCurrentUserInfo()', () => {
		it('reads auth.json for a stored token, without touching the API', async () => {
			await loginWithToken(STORED);
			clientState.fail = true;

			await expect(getCurrentUserInfo()).resolves.toMatchObject({ username: 'me', id: 'uid' });
		});

		it('fetches the account behind APIFY_TOKEN rather than the stored one', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);
			clientState.user = { id: 'uid2', username: 'other' };

			await expect(getCurrentUserInfo()).resolves.toMatchObject({ username: 'other', id: 'uid2' });
		});

		it('reuses the account the client lookup already fetched', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);
			clientState.user = { id: 'uid2', username: 'other' };
			await getLoggedClientOrThrow();

			// A second API call would throw here; the cache is what keeps this green.
			clientState.fail = true;

			await expect(getCurrentUserInfo()).resolves.toMatchObject({ username: 'other' });
		});

		it('prefers that cache over auth.json on the stored path, so a rename is picked up', async () => {
			await loginWithToken(STORED);
			clientState.user = { id: 'uid', username: 'renamed' };
			await getLoggedClientOrThrow();

			await expect(getCurrentUserInfo()).resolves.toMatchObject({ username: 'renamed' });
		});

		it('returns an empty account when no token resolves', async () => {
			await expect(getCurrentUserInfo()).resolves.toEqual({});
		});
	});

	describe('read paths do not persist', () => {
		it('resolving APIFY_TOKEN leaves the stored login untouched', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await resolveAuth();

			expect(await getSecret('uid', 'token')).toBe(STORED);
			expect(readActiveProfile()).toMatchObject({ username: 'me' });
		});
	});
});
