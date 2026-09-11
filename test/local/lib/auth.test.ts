import { existsSync, readFileSync } from 'node:fs';

import { loginWithToken, resolveAuth } from '../../../src/lib/auth.js';
import { AUTH_FILE_PATH } from '../../../src/lib/consts.js';
import { getProxyPassword, getToken, setToken } from '../../../src/lib/credentials.js';
import { getLoggedClientOrThrow } from '../../../src/lib/utils.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const { clientState } = vi.hoisted(() => ({
	clientState: {
		user: {} as Record<string, unknown>,
		fail: false,
		failWith: undefined as unknown,
	},
}));

// Stubbing the client is what lets the auth flow run in test:local.
vi.mock('apify-client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('apify-client')>();

	class FakeApifyClient {
		token?: string;

		constructor(options: { token?: string }) {
			this.token = options.token;
		}

		user() {
			return {
				get: async () => {
					if (clientState.fail) throw clientState.failWith ?? new Error('401');
					return clientState.user;
				},
			};
		}
	}

	return { ...actual, ApifyClient: FakeApifyClient };
});

useAuthSetup();
const { lastErrorMessage, logMessages } = useConsoleSpy();

const STORED = 'apify_api_stored';
const ENV = 'apify_api_env';
const FLAG = 'apify_api_flag';

const readAuthFile = () => JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));

describe('auth', () => {
	beforeEach(() => {
		clientState.fail = false;
		clientState.failWith = undefined;
		clientState.user = { id: 'uid', username: 'me', proxy: { password: 'pw' } };
	});

	describe('resolveAuth()', () => {
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

		it('prefers a token the command was given over APIFY_TOKEN and the stored login', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await expect(resolveAuth(FLAG)).resolves.toEqual({ token: FLAG, source: 'flag' });
		});

		it.each(['undefined', 'null', 'NaN', 'none', '0', '  '])(
			'ignores APIFY_TOKEN set to the placeholder %j and uses the stored login',
			async (placeholder) => {
				await loginWithToken(STORED);
				vitest.stubEnv('APIFY_TOKEN', placeholder);

				await expect(resolveAuth()).resolves.toEqual({ token: STORED, source: 'stored' });
			},
		);

		it('says so when it falls back from a placeholder APIFY_TOKEN', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', 'undefined');

			await resolveAuth();

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is invalid: "undefined"');
		});

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

		it('says it once even though the resolver runs several times per command', async () => {
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

			expect(await getToken()).toBe(STORED);
			expect(await getProxyPassword()).toBe('pw');
			expect(readAuthFile()).toMatchObject({ id: 'uid', username: 'me' });
		});

		it('writes nothing when the API rejects the token', async () => {
			clientState.fail = true;

			await expect(loginWithToken(STORED)).resolves.toBeNull();
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('ignores APIFY_TOKEN and saves the token it was given', async () => {
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await loginWithToken(STORED);

			expect(await getToken()).toBe(STORED);
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
			clientState.failWith = Object.assign(new Error('Unauthorized'), { statusCode: 401 });

			await expect(getLoggedClientOrThrow()).rejects.toThrow(`The API token in APIFY_TOKEN was rejected`);
		});

		it('names the stored login as the source of a rejected token', async () => {
			await loginWithToken(STORED);
			clientState.fail = true;
			clientState.failWith = Object.assign(new Error('Forbidden'), { statusCode: 403 });

			await expect(getLoggedClientOrThrow()).rejects.toThrow('Your stored API token was rejected');
		});

		it('does not blame the token when the API request itself failed', async () => {
			await loginWithToken(STORED);
			clientState.fail = true;
			clientState.failWith = new Error('getaddrinfo ENOTFOUND api.apify.com');

			await expect(getLoggedClientOrThrow()).rejects.toThrow('The Apify API request failed');
		});
	});

	describe('read paths do not persist', () => {
		it('resolving APIFY_TOKEN leaves the stored login untouched', async () => {
			await loginWithToken(STORED);
			vitest.stubEnv('APIFY_TOKEN', ENV);

			await resolveAuth();

			expect(await getToken()).toBe(STORED);
			expect(readAuthFile()).toMatchObject({ username: 'me' });
		});

		it('resolving a token the command was given leaves the stored login untouched', async () => {
			await setToken(STORED);

			await resolveAuth(FLAG);

			expect(await getToken()).toBe(STORED);
		});
	});
});
