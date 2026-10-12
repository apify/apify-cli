import { existsSync } from 'node:fs';

import open from 'open';

import { AUTH_FILE_PATH, CommandExitCodes } from '../../../src/lib/consts.js';
import { clientState, resetApifyClientMock } from '../../__setup__/apify-client-mock.js';
import { readActiveProfile } from '../../__setup__/auth-file.js';
import { useAuthSetup, useKeyringBackend } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import {
	keyringRefreshTokenKey,
	keyringStore,
	keyringTokenKey,
	resetKeyringMock,
} from '../../__setup__/keyring-mock.js';

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('computer-name', () => ({ default: () => 'test-machine' }));
// Device-code polling and the refresh lock both sleep through this; the tests should not.
vi.mock('node:timers/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:timers/promises')>()),
	setTimeout: vi.fn(async () => undefined),
}));

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

vi.mock('apify-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('apify-client')>()),
	ApifyClient: (await import('../../__setup__/apify-client-mock.js')).FakeApifyClient,
}));

const fakeUser = { id: 'user-1', username: 'tester' };
const TOKEN_KEY = keyringTokenKey(fakeUser.id);
const REFRESH_TOKEN_KEY = keyringRefreshTokenKey(fakeUser.id);

useAuthSetup();

const { logMessages, lastLogMessage } = useConsoleSpy();

const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');
const { LoginCommand } = await import('../../../src/commands/login.js');
const { AuthTokenCommand } = await import('../../../src/commands/auth/token.js');

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
		resetKeyringMock();
		resetApifyClientMock({ ...fakeUser });
		vi.mocked(open).mockClear();
	});

	afterEach(() => {
		process.exitCode = undefined;
	});

	it('defaults to the device code flow and stores a refreshable session', async () => {
		mockServer({ token: [() => json({ error: 'authorization_pending' }, 400), () => json(tokens)] });

		await testRunCommand(LoginCommand, {});

		expect(lastOpenedUrl().href).toBe(deviceResponse.verification_uri_complete);
		expect(allErrorOutput()).toContain('ABCD-EFGH');
		expect(allErrorOutput()).toContain('You are logged in to Apify as tester');

		expect(readActiveProfile()).toMatchObject({
			id: fakeUser.id,
			username: 'tester',
			authMethod: 'oauth2',
			hasRefreshToken: true,
			token: 'valid_integration_token',
			refreshToken: 'rt-1',
			oauth: { issuer: ISSUER, clientId: CLIENT_ID, tokenEndpoint: discovery.token_endpoint },
		});
		expect(Date.parse(readActiveProfile()!.expiresAt!)).toBeGreaterThan(Date.now());
	});

	it('reports a denied device authorization and stops', async () => {
		mockServer({ token: [() => json({ error: 'access_denied' }, 400)] });

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('denied in Apify Console');
		expect(process.exitCode).toBe(1);
		expect(existsSync(AUTH_FILE_PATH())).toBe(false);
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
		expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		expect(process.listenerCount('SIGINT')).toBe(0);
	});

	it('stores nothing when the API rejects the issued token', async () => {
		mockServer({ token: [() => json(tokens)] });
		clientState.fail = true;

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('was not accepted by the Apify API');
		expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.MissingAuth);
	});

	it('refuses to log in while APIFY_TOKEN would override the session', async () => {
		vitest.stubEnv('APIFY_TOKEN', 'apify_api_env_token');
		const fetchSpy = mockServer({ token: [] });

		await testRunCommand(LoginCommand, {});

		expect(allErrorOutput()).toContain('APIFY_TOKEN is set, so other commands will ignore this login');
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
	});

	it('auth token prints the session token and notes its expiry on stderr', async () => {
		mockServer({ token: [() => json(tokens)] });
		await testRunCommand(LoginCommand, {});

		await testRunCommand(AuthTokenCommand, {});

		expect(lastLogMessage()).toBe('valid_integration_token');
		expect(logMessages.error.at(-1)).toMatch(/^Note: this token expires at \d{4}-/);
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
		expect(readActiveProfile()).toMatchObject({ authMethod: 'oauth2', refreshToken: 'rt-1' });
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

	it('--token turns an OAuth login of the same account into a plain-token one', async () => {
		mockServer({ token: [() => json(tokens)] });
		await testRunCommand(LoginCommand, {});
		expect(readActiveProfile()!.authMethod).toBe('oauth2');

		await testRunCommand(LoginCommand, { flags_token: 'valid_plain_token' });

		expect(allErrorOutput()).toContain('You are logged in to Apify as tester');
		const profile = readActiveProfile()!;
		expect(profile).toMatchObject({
			authMethod: 'token',
			expiresAt: null,
			hasRefreshToken: false,
			token: 'valid_plain_token',
		});
		expect(profile.oauth).toBeUndefined();
		expect(profile.refreshToken).toBeUndefined();
	});

	describe('keyring backend', () => {
		useKeyringBackend();

		it('keeps the refresh token out of auth.json', async () => {
			mockServer({ token: [() => json(tokens)] });

			await testRunCommand(LoginCommand, {});

			expect(keyringStore.get(TOKEN_KEY)).toBe('valid_integration_token');
			expect(keyringStore.get(REFRESH_TOKEN_KEY)).toBe('rt-1');

			const profile = readActiveProfile()!;
			expect(profile.token).toBeUndefined();
			expect(profile.refreshToken).toBeUndefined();
			expect(profile.oauth).toMatchObject({ issuer: ISSUER });
		});

		it('--token forgets the refresh token in the keyring as well', async () => {
			mockServer({ token: [() => json(tokens)] });
			await testRunCommand(LoginCommand, {});
			expect(keyringStore.has(REFRESH_TOKEN_KEY)).toBe(true);

			await testRunCommand(LoginCommand, { flags_token: 'valid_plain_token' });

			expect(keyringStore.get(TOKEN_KEY)).toBe('valid_plain_token');
			expect(keyringStore.has(REFRESH_TOKEN_KEY)).toBe(false);
			expect(readActiveProfile()!.oauth).toBeUndefined();
		});
	});
});
