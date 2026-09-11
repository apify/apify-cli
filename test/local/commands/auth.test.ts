import { existsSync, readFileSync, statSync } from 'node:fs';
import process from 'node:process';

import { AUTH_FILE_PATH } from '../../../src/lib/consts.js';
import { getToken } from '../../../src/lib/credentials.js';
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

const readAuthFile = () => JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));
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
		it('login stores the token and user metadata in auth.json', async () => {
			await login();

			expect(readAuthFile()).toMatchObject({
				token: TOKEN,
				id: 'uid',
				username: 'me',
				secretsBackend: 'file',
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

		it('logging in as another account replaces the stored metadata', async () => {
			clientState.user = { id: 'uid', username: 'me', email: 'me@example.com' };
			await login();

			clientState.user = { id: 'uid2', username: 'other' };
			await login('apify_api_other_token');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ token: 'apify_api_other_token', id: 'uid2', username: 'other' });
			// The new account has no email, so the old one must not linger.
			expect(authFile.email).toBeUndefined();
		});

		it('login with an invalid token stores nothing', async () => {
			clientState.fail = true;
			await login('bad-token');

			expect(lastErrorMessage()).toContain('Login to Apify failed');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});
	});

	describe('keyring backend', () => {
		useKeyringBackend();

		it('login stores the secrets in the keyring and keeps them out of auth.json', async () => {
			await login();

			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe(TOKEN);
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');

			const authFile = readAuthFile();
			expect(authFile).toMatchObject({ id: 'uid', username: 'me', secretsBackend: 'keyring' });
			expect(authFile.token).toBeUndefined();
			expect(authFile.proxy).toEqual({ groups: [{ name: 'g' }] });
		});

		it('login drops the proxy object from auth.json when it only held the password', async () => {
			clientState.user.proxy = { password: 'pw' };
			await login();

			expect(readAuthFile()).not.toHaveProperty('proxy');
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
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
