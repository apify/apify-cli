import { existsSync, statSync } from 'node:fs';
import process from 'node:process';

import { AUTH_FILE_PATH, CommandExitCodes } from '../../../src/lib/consts.js';
import { getSecret } from '../../../src/lib/credentials.js';
import { clientState, resetApifyClientMock } from '../../__setup__/apify-client-mock.js';
import { readActiveProfile, readAuthFile } from '../../__setup__/auth-file.js';
import { useAuthSetup, useKeyringBackend } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import {
	keyringProxyPasswordKey,
	keyringSetKeys,
	keyringStore,
	keyringTokenKey,
	resetKeyringMock,
} from '../../__setup__/keyring-mock.js';

const TOKEN_KEY = keyringTokenKey('uid');
const PROXY_PASSWORD_KEY = keyringProxyPasswordKey('uid');

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

vi.mock('apify-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('apify-client')>()),
	ApifyClient: (await import('../../__setup__/apify-client-mock.js')).FakeApifyClient,
}));

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
		resetApifyClientMock({ id: 'uid', username: 'me', proxy: { password: 'pw', groups: [{ name: 'g' }] } });
	});

	describe('file backend', () => {
		it('login stores the token and one profile keyed by user ID', async () => {
			await login();

			expect(readAuthFile()).toMatchObject({ version: 2, secretsBackend: 'file' });
			expect(readAuthFile().token).toBeUndefined();
			expect(readActiveProfile()).toEqual({
				id: 'uid',
				username: 'me',
				name: null,
				authMethod: 'token',
				expiresAt: null,
				hasRefreshToken: false,
				loggedInAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				token: TOKEN,
				proxy: { password: 'pw' },
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
			expect(await getSecret('uid', 'token')).toBeUndefined();
		});

		it('logging in as another account replaces the stored profile', async () => {
			clientState.user = { id: 'uid', username: 'me', email: 'me@example.com' };
			await login();

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ activeProfile: 'uid2' });
			// Additive login is a later stage; until then the old profile must not linger.
			expect(Object.keys(authFile.profiles!)).toEqual(['uid2']);
			expect(readActiveProfile()).toMatchObject({ username: 'other', token: 'apify_api_other_token' });
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

		it('login fails and stores nothing when APIFY_TOKEN holds a different token', async () => {
			vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');

			await login();

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set, so other commands will ignore this login');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
			process.exitCode = 0;
		});

		it('login goes through when APIFY_TOKEN holds the same token, as CI sets both', async () => {
			vitest.stubEnv('APIFY_TOKEN', TOKEN);

			await login();

			expect(await getSecret('uid', 'token')).toBe(TOKEN);
			expect(lastErrorMessage()).toContain('You are logged in to Apify as me');
		});

		it('login goes through while APIFY_TOKEN is a placeholder, so a broken one can be fixed', async () => {
			vitest.stubEnv('APIFY_TOKEN', 'undefined');

			await login();

			expect(await getSecret('uid', 'token')).toBe(TOKEN);
			expect(lastErrorMessage()).toContain('You are logged in to Apify as me');
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

		it('a placeholder APIFY_TOKEN fails the command instead of falling back', async () => {
			await login();
			vitest.stubEnv('APIFY_TOKEN', 'undefined');

			await testRunCommand(AuthTokenCommand, {});

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set to "undefined"');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
			process.exitCode = 0;
		});

		it('auth token prints APIFY_TOKEN over the stored token, and stores nothing', async () => {
			await login();
			vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');

			await testRunCommand(AuthTokenCommand, {});

			expect(lastLogMessage()).toBe('apify_api_env_token');
			expect(await getSecret('uid', 'token')).toBe(TOKEN);
			expect(readActiveProfile()).toMatchObject({ username: 'me' });
		});
	});

	describe('keyring backend', () => {
		useKeyringBackend();

		it('login stores the secrets in the keyring and keeps them out of auth.json', async () => {
			await login();

			expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ version: 2, secretsBackend: 'keyring' });
			expect(authFile.token).toBeUndefined();
			// Proxy groups are not a secret, but nothing reads them either.
			expect(authFile).not.toHaveProperty('proxy');
			expect(readActiveProfile()).toMatchObject({ id: 'uid', username: 'me' });
		});

		it('logging in as an account with no proxy password forgets the previous one', async () => {
			await login();
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			// The keyring outlives the auth.json rewrite, so without an explicit delete the child
			// Actor would run with the previous account's proxy credential.
			expect(keyringStore.has(PROXY_PASSWORD_KEY)).toBe(false);
			expect(keyringStore.has(keyringProxyPasswordKey('uid2'))).toBe(false);
		});

		it('switching accounts clears the outgoing account entries', async () => {
			await login();
			expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);

			clientState.user = { id: 'uid2', username: 'other', proxy: { password: 'pw2' } };
			await login('apify_api_other_token');

			// auth.json no longer names uid, and the keyring has no listing API, so anything left
			// under its key would be unreachable for good.
			expect(keyringStore.get(TOKEN_KEY)).toBeUndefined();
			expect(keyringStore.get(keyringTokenKey('uid2'))).toBe('apify_api_other_token');
		});

		it('logging in again as the same account keeps its entries', async () => {
			await login();
			await login();

			expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');
		});

		it('logging in twice with the same token writes the keyring once', async () => {
			await login();
			await login();

			expect(keyringSetKeys.filter((key) => key === TOKEN_KEY)).toHaveLength(1);
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
