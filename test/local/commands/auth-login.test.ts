import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import open from 'open';

import { AUTH_FILE_PATH } from '../../../src/lib/consts.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('computer-name', () => ({ default: () => 'test-machine' }));
// Device-code polling and the refresh lock both sleep through this; the tests should not.
vi.mock('node:timers/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:timers/promises')>()),
	setTimeout: vi.fn(async () => undefined),
}));

const fakeUser = { id: 'user-1', username: 'tester', email: 'tester@example.com' };

vi.mock('apify-client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('apify-client')>();
	class ApifyClient {
		token?: string;
		constructor(options: { token?: string } = {}) {
			this.token = options.token;
		}
		user() {
			return {
				get: async () => {
					if (!this.token?.startsWith('valid_')) throw new Error('401 Unauthorized');
					return { ...fakeUser };
				},
			};
		}
	}
	return { ...actual, ApifyClient };
});

const keyringStore = new Map<string, string>();

vi.mock('@napi-rs/keyring', () => {
	class Entry {
		private key: string;
		constructor(service: string, account: string) {
			this.key = `${service}:${account}`;
		}
		getPassword(): string | null {
			return keyringStore.get(this.key) ?? null;
		}
		setPassword(password: string): void {
			keyringStore.set(this.key, password);
		}
		deletePassword(): boolean {
			return keyringStore.delete(this.key);
		}
	}
	return { Entry };
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');
const { LoginCommand } = await import('../../../src/commands/login.js');
const { __resetCredentialsForTests } = await import('../../../src/lib/credentials.js');
const { __resetOAuthSessionForTests, saveOAuthSession } = await import('../../../src/lib/oauth/session.js');
const { getLoggedClient } = await import('../../../src/lib/utils.js');

const ISSUER = 'https://issuer.test';
const CLIENT_ID = 'https://client.test/oauth-client.json';

const discovery = {
	issuer: ISSUER,
	authorization_endpoint: 'https://console.test/authorize/oauth',
	device_authorization_endpoint: `${ISSUER}/oauth/apps/devices`,
	token_endpoint: `${ISSUER}/oauth/apps/token`,
	scopes_supported: ['full_api_access'],
};

const deviceResponse = {
	device_code: 'dev-code',
	user_code: 'ABCD-EFGH',
	verification_uri: 'https://console.test/authorize/device',
	verification_uri_complete: 'https://console.test/authorize/device?code=ABCD-EFGH',
	expires_in: 300,
	interval: 5,
};

const tokens = {
	access_token: 'valid_integration_token',
	token_type: 'Bearer',
	scope: 'full_api_access',
	expires_in: 3599,
	refresh_token: 'rt-1',
	refresh_token_expires_in: 5183999,
};

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const readAuthFile = () => (existsSync(AUTH_FILE_PATH()) ? JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8')) : {});
const allErrorOutput = () => logMessages.error.join('\n');

interface FakeServer {
	discovery?: () => Response | Promise<Response>;
	device?: () => Response;
	token: (() => Response)[];
}

/** Answers the OAuth endpoints from memory; anything else (the loopback redirect) goes over the wire. */
const mockServer = ({ discovery: discoveryHandler = () => json(discovery), device, token }: FakeServer) => {
	const tokenQueue = [...token];
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input);
		if (url === `${ISSUER}/.well-known/oauth-authorization-server`) return discoveryHandler();
		if (url === discovery.device_authorization_endpoint) return (device ?? (() => json(deviceResponse, 201)))();
		if (url === discovery.token_endpoint) return tokenQueue.shift()!();
		return realFetch(input, init);
	});
};

const lastOpenedUrl = () => new URL(vi.mocked(open).mock.calls.at(-1)![0] as string);

describe('apify login', () => {
	beforeEach(() => {
		vitest.stubEnv('APIFY_CLI_OAUTH_ISSUER_URL', ISSUER);
		vitest.stubEnv('APIFY_CLI_OAUTH_CLIENT_ID', CLIENT_ID);
		keyringStore.clear();
		vi.mocked(open).mockClear();
		__resetOAuthSessionForTests();
	});

	afterEach(() => {
		__resetOAuthSessionForTests();
		process.exitCode = undefined;
	});

	it('defaults to the device code flow and stores a refreshable session', async () => {
		mockServer({ token: [() => json({ error: 'authorization_pending' }, 400), () => json(tokens)] });

		await testRunCommand(LoginCommand, {});

		expect(lastOpenedUrl().href).toBe(deviceResponse.verification_uri_complete);
		expect(allErrorOutput()).toContain('ABCD-EFGH');
		expect(allErrorOutput()).toContain('You are logged in to Apify as tester');

		const file = readAuthFile();
		expect(file.token).toBe('valid_integration_token');
		expect(file.username).toBe('tester');
		expect(file.oauth).toMatchObject({
			issuer: ISSUER,
			clientId: CLIENT_ID,
			tokenEndpoint: discovery.token_endpoint,
			refreshToken: 'rt-1',
		});
		expect(file.oauth.expiresAt).toBeGreaterThan(Date.now());
	});

	it('reports a denied device authorization and stops', async () => {
		mockServer({ token: [() => json({ error: 'access_denied' }, 400)] });

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('denied in Apify Console');
		expect(process.exitCode).toBe(1);
		expect(readAuthFile().oauth).toBeUndefined();
	});

	it('cancels the login on an interrupt signal while waiting for the browser', async () => {
		mockServer({ token: [] });
		// Never authorized: every poll stays pending until the signal arrives.
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			if (url === `${ISSUER}/.well-known/oauth-authorization-server`) return json(discovery);
			if (url === discovery.device_authorization_endpoint) return json(deviceResponse, 201);
			if (url === discovery.token_endpoint) {
				// The sleep between polls is mocked away in this file; yield a real tick so the signal can land.
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
				return json({ error: 'authorization_pending' }, 400);
			}
			return realFetch(input, init);
		});

		const run = testRunCommand(LoginCommand, {});
		await vi.waitFor(() => expect(open).toHaveBeenCalled());

		process.emit('SIGINT', 'SIGINT');
		await run;

		expect(allErrorOutput()).toContain('Login cancelled.');
		expect(process.exitCode).toBe(1);
		expect(readAuthFile().oauth).toBeUndefined();
		expect(process.listenerCount('SIGINT')).toBe(0);
	});

	it('drops the session again when the API rejects the issued token', async () => {
		mockServer({ token: [() => json({ ...tokens, access_token: 'bogus_token' })] });

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('was not accepted by the Apify API');
		expect(readAuthFile().oauth).toBeUndefined();
	});

	it('falls back to the authorization code flow when device authorization is unavailable', async () => {
		mockServer({ device: () => json({ error: 'not_found' }, 404), token: [() => json(tokens)] });

		const run = testRunCommand(LoginCommand, {});
		await vi.waitFor(() => expect(open).toHaveBeenCalled());

		const authorizeUrl = lastOpenedUrl();
		expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(discovery.authorization_endpoint);

		const redirect = new URL(authorizeUrl.searchParams.get('redirect_uri')!);
		redirect.searchParams.set('code', 'auth-code');
		redirect.searchParams.set('state', authorizeUrl.searchParams.get('state')!);
		await realFetch(redirect);

		await run;

		expect(allErrorOutput()).toContain('You are logged in to Apify as tester');
		expect(readAuthFile().oauth).toMatchObject({ refreshToken: 'rt-1' });
	});

	it('falls back to the legacy Console hand-off when discovery fails', async () => {
		mockServer({ discovery: () => Promise.reject(new Error('ECONNREFUSED')), token: [] });

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('Using the Console login instead');

		const consoleUrl = lastOpenedUrl();
		expect(consoleUrl.searchParams.get('localCliCommand')).toBe('login');
		const port = consoleUrl.searchParams.get('localCliPort')!;
		const token = consoleUrl.searchParams.get('localCliToken')!;

		// Shut the loopback server down the way Console would.
		const response = await realFetch(`http://127.0.0.1:${port}/api/v1/exit`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ actionCanceled: true }),
		});
		expect(response.ok).toBe(true);
	});

	it('--token replaces an OAuth session with a plain token', async () => {
		await saveOAuthSession(tokens, { issuer: ISSUER, clientId: CLIENT_ID, tokenEndpoint: discovery.token_endpoint });
		expect(readAuthFile().oauth).toBeDefined();

		await testRunCommand(LoginCommand, { flags_token: 'valid_plain_token' });

		expect(allErrorOutput()).toContain('You are logged in to Apify as tester');
		const file = readAuthFile();
		expect(file.token).toBe('valid_plain_token');
		expect(file.oauth).toBeUndefined();
	});

	it('keeps the refresh token out of auth.json on the keyring backend', async () => {
		vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		__resetCredentialsForTests();
		mkdirSync(dirname(AUTH_FILE_PATH()), { recursive: true });
		writeFileSync(
			AUTH_FILE_PATH(),
			JSON.stringify({
				secretsBackend: 'keyring',
				oauth: {
					issuer: ISSUER,
					clientId: CLIENT_ID,
					tokenEndpoint: discovery.token_endpoint,
					expiresAt: 1,
					refreshToken: 'inline',
				},
			}),
		);

		await getLoggedClient('valid_token');

		const file = readAuthFile();
		expect(file.oauth).toMatchObject({ issuer: ISSUER });
		expect(file.oauth.refreshToken).toBeUndefined();
		expect(file.token).toBeUndefined();
	});
});
