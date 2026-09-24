import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { AUTH_BACKUP_FILE_PATH, type AuthProfile } from '../../../src/lib/auth-file.js';
import { AUTH_FILE_PATH, CommandExitCodes, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import { __resetCredentialsForTests, getSecret } from '../../../src/lib/credentials.js';
import { clientState, resetApifyClientMock } from '../../__setup__/apify-client-mock.js';
import { readActiveProfile, readAuthFile, v1AuthFile } from '../../__setup__/auth-file.js';
import { useAuthSetup, useKeyringBackend } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import {
	keyringProxyPasswordKey,
	keyringSetKeys,
	keyringStore,
	keyringTokenKey,
	LEGACY_KEYRING_TOKEN_KEY,
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

const PROFILE: AuthProfile = {
	name: null,
	authMethod: 'token',
	expiresAt: null,
	hasRefreshToken: false,
	loggedInAt: null,
};

const writeAuthFile = (data: unknown) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data));
};

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
				name: 'me',
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

		it('logging in as another account adds a profile and makes it active', async () => {
			await login();

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ activeProfile: 'uid2' });
			expect(Object.keys(authFile.profiles!).sort()).toEqual(['uid', 'uid2']);
			expect(authFile.profiles!.uid).toMatchObject({ name: 'me', token: TOKEN });
			expect(readActiveProfile()).toMatchObject({ name: 'other', token: 'apify_api_other_token' });
			expect(lastErrorMessage()).toContain('Other stored accounts: me.');
		});

		it('logging in again to a stored account updates it in place and makes it active', async () => {
			await login();
			const firstLoginAt = readActiveProfile()!.loggedInAt!;

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			clientState.user = { id: 'uid', username: 'me-renamed' };
			await new Promise((resolve) => setTimeout(resolve, 5));
			await login('apify_api_rotated_token');

			const authFile = readAuthFile();
			expect(Object.keys(authFile.profiles!).sort()).toEqual(['uid', 'uid2']);
			expect(readActiveProfile()).toMatchObject({
				id: 'uid',
				name: 'me-renamed',
				token: 'apify_api_rotated_token',
			});
			expect(readActiveProfile()!.loggedInAt! > firstLoginAt).toBe(true);
		});

		it('logout with two accounts makes the other one active and says so', async () => {
			await login();
			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			await testRunCommand(AuthLogoutCommand, {});

			expect(lastErrorMessage()).toContain('You are logged out of other. me is now the active account.');
			expect(readAuthFile().profiles).not.toHaveProperty('uid2');
			expect(readActiveProfile()).toMatchObject({ id: 'uid', token: TOKEN });

			await testRunCommand(AuthTokenCommand, {});
			expect(lastLogMessage()).toBe(TOKEN);
		});

		it('logout makes the most recently logged-in remaining account active', async () => {
			writeAuthFile({
				version: 2,
				activeProfile: 'uid',
				secretsBackend: 'file',
				profiles: {
					uid: { ...PROFILE, name: 'me', loggedInAt: '2026-03-01T00:00:00.000Z', token: TOKEN },
					old: { ...PROFILE, name: 'old', loggedInAt: null, token: 't-old' },
					recent: { ...PROFILE, name: 'recent', loggedInAt: '2026-02-01T00:00:00.000Z', token: 't-recent' },
					older: { ...PROFILE, name: 'older', loggedInAt: '2026-01-01T00:00:00.000Z', token: 't-older' },
				},
			});

			await testRunCommand(AuthLogoutCommand, {});

			expect(readAuthFile().activeProfile).toBe('recent');
		});

		it('logout with a dangling active profile still names the account that becomes active', async () => {
			writeAuthFile({
				version: 2,
				activeProfile: 'gone',
				secretsBackend: 'file',
				profiles: { uid: { ...PROFILE, name: 'me', token: TOKEN } },
			});

			await testRunCommand(AuthLogoutCommand, {});

			expect(lastErrorMessage()).toContain('You are logged out. me is now the active account.');
			expect(readAuthFile().activeProfile).toBe('uid');
		});

		it('a migrated v1 account survives logging in to a second account', async () => {
			writeAuthFile(v1AuthFile());

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ version: 2, activeProfile: 'uid2' });
			expect(authFile.profiles!.uid).toMatchObject({ username: 'me', token: 'apify_api_v1_token' });
			expect(existsSync(AUTH_BACKUP_FILE_PATH())).toBe(true);
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

		it('logging in again with no proxy password forgets the previous one', async () => {
			await login();
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');

			clientState.user = { id: 'uid', username: 'me' };
			await login();

			expect(keyringStore.has(PROXY_PASSWORD_KEY)).toBe(false);
		});

		it('logging in to a second account keeps the first account entries', async () => {
			await login();

			clientState.user = { id: 'uid2', username: 'other', proxy: { password: 'pw2' } };
			await login('apify_api_other_token');

			expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');
			expect(keyringStore.get(keyringTokenKey('uid2'))).toBe('apify_api_other_token');
			expect(keyringStore.get(keyringProxyPasswordKey('uid2'))).toBe('pw2');
		});

		it('a second login with the keyring disabled leaves the first account on the keyring', async () => {
			await login();

			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			__resetCredentialsForTests();
			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile.secretsBackend).toBe('keyring');
			expect(authFile.profiles!.uid2).toMatchObject({ secretsBackend: 'file', token: 'apify_api_other_token' });
			expect(authFile.profiles!.uid).not.toHaveProperty('secretsBackend');

			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			__resetCredentialsForTests();
			await testRunCommand(AuthLogoutCommand, {});

			expect(await getSecret('uid', 'token')).toBe(TOKEN);
		});

		it('logging in again with the keyring disabled keeps reading the new token once it is enabled', async () => {
			await login();

			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			__resetCredentialsForTests();
			await login('apify_api_rotated_token');

			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			__resetCredentialsForTests();
			expect(await getSecret('uid', 'token')).toBe('apify_api_rotated_token');
		});

		it('logging in to a second account drops unkeyed entries left by the first', async () => {
			await login();
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, TOKEN);

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			expect(keyringStore.has(LEGACY_KEYRING_TOKEN_KEY)).toBe(false);
		});

		it('logout with two accounts clears only the outgoing account entries', async () => {
			await login();
			clientState.user = { id: 'uid2', username: 'other', proxy: { password: 'pw2' } };
			await login('apify_api_other_token');

			await testRunCommand(AuthLogoutCommand, {});

			expect(keyringStore.has(keyringTokenKey('uid2'))).toBe(false);
			expect(keyringStore.has(keyringProxyPasswordKey('uid2'))).toBe(false);
			expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);
			expect(readActiveProfile()).toMatchObject({ id: 'uid' });
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

		// Clearing the keyring before the switch is written left both accounts unreachable: the
		// keyring has no listing API, so auth.json is the only index of what it holds.
		it.skipIf(process.platform === 'win32')(
			'a switch that cannot be written keeps the outgoing account entries',
			async () => {
				await login();
				expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);

				clientState.user = { id: 'uid2', username: 'other' };
				chmodSync(GLOBAL_CONFIGS_FOLDER(), 0o500);

				try {
					await login('apify_api_other_token');

					expect(readActiveProfile()).toMatchObject({ id: 'uid' });
					expect(keyringStore.get(TOKEN_KEY)).toBe(TOKEN);
					expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');
				} finally {
					chmodSync(GLOBAL_CONFIGS_FOLDER(), 0o700);
					process.exitCode = 0;
				}
			},
		);

		// Exiting 0 with a success line told the user they were logged out while auth.json still
		// held the account the keyring entries were just deleted for.
		it.skipIf(process.platform === 'win32')('logout says so when the profile cannot be removed', async () => {
			await login();
			chmodSync(GLOBAL_CONFIGS_FOLDER(), 0o500);

			try {
				await testRunCommand(AuthLogoutCommand, {});

				expect(keyringStore.size).toBe(0);
				expect(existsSync(AUTH_FILE_PATH())).toBe(true);
				expect(lastErrorMessage()).toContain('Logout did not finish');
				expect(lastErrorMessage()).toContain('Your secrets were removed from the OS keyring.');
				expect(lastErrorMessage()).toContain(`Your account is still in ${AUTH_FILE_PATH()}`);
				expect(process.exitCode).toBe(CommandExitCodes.RunFailed);
			} finally {
				chmodSync(GLOBAL_CONFIGS_FOLDER(), 0o700);
				process.exitCode = 0;
			}
		});
	});
});
