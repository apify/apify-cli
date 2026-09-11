import { existsSync, statSync } from 'node:fs';
import process from 'node:process';

import { AUTH_FILE_PATH, CommandExitCodes } from '../../../src/lib/consts.js';
import { getToken } from '../../../src/lib/credentials.js';
import { readActiveProfile, readAuthFile } from '../../__setup__/auth-file.js';
import { useAuthSetup, useKeyringBackend } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import {
	KEYRING_PROXY_PASSWORD_KEY,
	KEYRING_TOKEN_KEY,
	keyringSetKeys,
	keyringStore,
	resetKeyringMock,
} from '../../__setup__/keyring-mock.js';

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

const { clientState } = vi.hoisted(() => ({
	clientState: {
		user: {} as Record<string, unknown>,
		fail: false,
	},
}));

// Stubbing the client is what lets the auth commands run in test:local.
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
					if (clientState.fail) throw new Error('401');
					return clientState.user;
				},
			};
		}
	}

	return { ...actual, ApifyClient: FakeApifyClient };
});

useAuthSetup();
const { lastLogMessage, lastErrorMessage } = useConsoleSpy();

const { AuthLoginCommand } = await import('../../../src/commands/auth/login.js');
const { AuthLogoutCommand } = await import('../../../src/commands/auth/logout.js');
const { AuthTokenCommand } = await import('../../../src/commands/auth/token.js');
const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');

const TOKEN = 'apify_api_test_token';

const login = (token = TOKEN) => testRunCommand(AuthLoginCommand, { flags_token: token });

describe('auth commands', () => {
	beforeEach(() => {
		resetKeyringMock();
		clientState.fail = false;
		clientState.user = {
			id: 'uid',
			username: 'me',
			proxy: { password: 'pw', groups: [{ name: 'g' }] },
		};
	});

	describe('file backend', () => {
		it('login stores the token and one profile keyed by user ID', async () => {
			await login();

			expect(readAuthFile()).toMatchObject({ version: 2, token: TOKEN, secretsBackend: 'file' });
			expect(readActiveProfile()).toEqual({
				id: 'uid',
				username: 'me',
				name: null,
				authMethod: 'token',
				expiresAt: null,
				hasRefreshToken: false,
			});
			expect(lastErrorMessage()).toContain('You are logged in to Apify as me');
		});

		it.skipIf(process.platform === 'win32')('login writes auth.json readable only by the owner', async () => {
			await login();

			expect(statSync(AUTH_FILE_PATH()).mode & 0o777).toBe(0o600);
		});

		it('auth token prints the stored token', async () => {
			await login();
			await testRunCommand(AuthTokenCommand, {});

			expect(lastLogMessage()).toBe(TOKEN);
		});

		it('logout removes the stored token and auth.json', async () => {
			await login();
			await testRunCommand(AuthLogoutCommand, {});

			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(await getToken()).toBeUndefined();
		});

		it('logging in as another account replaces the stored profile', async () => {
			clientState.user = { id: 'uid', username: 'me', email: 'me@example.com' };
			await login();

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ activeProfile: 'uid2', token: 'apify_api_other_token' });
			// Additive login is a later stage; until then the old profile must not linger.
			expect(Object.keys(authFile.profiles!)).toEqual(['uid2']);
			expect(readActiveProfile()).toMatchObject({ username: 'other' });
		});

		it('login with an invalid token stores nothing and fails the command', async () => {
			clientState.fail = true;
			await login('bad-token');

			expect(lastErrorMessage()).toContain('Login to Apify failed');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			// A login that exits 0 lets `apify login --token $BAD && apify push` run on.
			expect(process.exitCode).toBe(CommandExitCodes.MissingAuth);
			process.exitCode = 0;
		});

		it('login saves its own token even when APIFY_TOKEN is set, and says it is overridden', async () => {
			vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');
			await login();

			expect(await getToken()).toBe(TOKEN);
			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set, so other commands keep using that token');
		});

		it('login says nothing about APIFY_TOKEN when it is not set', async () => {
			await login();

			expect(lastErrorMessage()).not.toContain('APIFY_TOKEN');
		});

		it('logout warns that APIFY_TOKEN still authenticates', async () => {
			await login();
			vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');

			await testRunCommand(AuthLogoutCommand, {});

			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(lastErrorMessage()).toContain('APIFY_TOKEN is still set');
		});

		it('logout says nothing about APIFY_TOKEN when it is not set', async () => {
			await login();

			await testRunCommand(AuthLogoutCommand, {});

			expect(lastErrorMessage()).not.toContain('APIFY_TOKEN');
		});

		it('a placeholder APIFY_TOKEN falls back to the stored login', async () => {
			await login();
			vitest.stubEnv('APIFY_TOKEN', 'undefined');

			await testRunCommand(AuthTokenCommand, {});

			expect(lastLogMessage()).toBe(TOKEN);
		});

		it('auth token prints APIFY_TOKEN over the stored token, and stores nothing', async () => {
			await login();
			vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');

			await testRunCommand(AuthTokenCommand, {});

			expect(lastLogMessage()).toBe('apify_api_env_token');
			expect(await getToken()).toBe(TOKEN);
			expect(readActiveProfile()).toMatchObject({ username: 'me' });
		});
	});

	describe('keyring backend', () => {
		useKeyringBackend();

		it('login stores the secrets in the keyring and keeps them out of auth.json', async () => {
			await login();

			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe(TOKEN);
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ version: 2, secretsBackend: 'keyring' });
			expect(authFile.token).toBeUndefined();
			// Proxy groups are not a secret, but nothing reads them either.
			expect(authFile).not.toHaveProperty('proxy');
			expect(readActiveProfile()).toMatchObject({ id: 'uid', username: 'me' });
		});

		it('logging in twice with the same token writes the keyring once', async () => {
			await login();
			await login();

			expect(keyringSetKeys.filter((key) => key === KEYRING_TOKEN_KEY)).toHaveLength(1);
		});

		it('auth token prints the token from the keyring', async () => {
			await login();
			await testRunCommand(AuthTokenCommand, {});

			expect(lastLogMessage()).toBe(TOKEN);
		});

		it('logout clears the keyring and removes auth.json', async () => {
			await login();
			await testRunCommand(AuthLogoutCommand, {});

			expect(keyringStore.size).toBe(0);
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});
	});
});
