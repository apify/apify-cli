import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { cryptoRandomObjectId } from '@apify/utilities';

import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../../src/lib/consts.js';
import {
	__resetCredentialsForTests,
	getOAuthMetadata,
	getOAuthRefreshToken,
	getToken,
	setOAuthMetadata,
	setOAuthRefreshToken,
	setToken,
} from '../../../../src/lib/credentials.js';
import {
	__resetOAuthSessionForTests,
	clearOAuthSession,
	getAccessToken,
	OAuthSessionExpiredError,
	saveOAuthSession,
} from '../../../../src/lib/oauth/session.js';
import { getLocalUserInfo } from '../../../../src/lib/utils.js';

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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ISSUER = 'https://issuer.test';
const CLIENT_ID = 'https://client.test/oauth-client.json';
const TOKEN_ENDPOINT = `${ISSUER}/oauth/apps/token`;

const readAuthFile = () => JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));
const lockPath = () => join(GLOBAL_CONFIGS_FOLDER(), 'oauth-refresh.lock');

const seedSession = async ({
	token = 'tok_old',
	refreshToken = 'rt_1',
	expiresInMs = HOUR,
	refreshTokenExpiresInMs = 60 * DAY,
}: { token?: string; refreshToken?: string; expiresInMs?: number; refreshTokenExpiresInMs?: number } = {}) => {
	await setToken(token);
	await setOAuthRefreshToken(refreshToken);
	setOAuthMetadata({
		issuer: ISSUER,
		clientId: CLIENT_ID,
		tokenEndpoint: TOKEN_ENDPOINT,
		expiresAt: Date.now() + expiresInMs,
		refreshTokenExpiresAt: Date.now() + refreshTokenExpiresInMs,
	});
};

const tokenResponse = (overrides: Record<string, unknown> = {}) =>
	new Response(
		JSON.stringify({
			access_token: 'tok_new',
			token_type: 'Bearer',
			scope: 'full_api_access',
			expires_in: 3599,
			refresh_token: 'rt_2',
			refresh_token_expires_in: 5183999,
			...overrides,
		}),
		{ status: 200 },
	);

const oauthError = (error: string) => new Response(JSON.stringify({ error }), { status: 400 });

const formBody = (init: RequestInit | undefined) => Object.fromEntries(init!.body as URLSearchParams);

describe.each([
	['file', '1'],
	['keyring', ''],
])('oauth session on the %s backend', (_backend, disableKeyring) => {
	beforeEach(() => {
		vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', cryptoRandomObjectId(12));
		vitest.stubEnv('APIFY_DISABLE_KEYRING', disableKeyring);
		keyringStore.clear();
		__resetCredentialsForTests();
		__resetOAuthSessionForTests();
	});

	afterEach(async () => {
		await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		vitest.unstubAllEnvs();
		__resetCredentialsForTests();
		__resetOAuthSessionForTests();
		process.exitCode = undefined;
	});

	it('passes a plain API token through without touching the network', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await setToken('apify_api_plain');

		expect(await getAccessToken()).toBe('apify_api_plain');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns the stored token while it is fresh', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await seedSession({ expiresInMs: 30 * MINUTE });

		expect(await getAccessToken()).toBe('tok_old');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refreshes an expiring token and stores the rotated pair', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });
		const before = Date.now();

		expect(await getAccessToken()).toBe('tok_new');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe(TOKEN_ENDPOINT);
		expect(formBody(fetchSpy.mock.calls[0][1])).toEqual({
			grant_type: 'refresh_token',
			refresh_token: 'rt_1',
			client_id: CLIENT_ID,
		});

		expect(await getToken()).toBe('tok_new');
		expect(await getOAuthRefreshToken()).toBe('rt_2');
		const metadata = getOAuthMetadata()!;
		expect(metadata.expiresAt).toBeGreaterThanOrEqual(before + 3599_000);
		expect(metadata.refreshTokenExpiresAt).toBeGreaterThanOrEqual(before + 5183999_000);
		expect(existsSync(lockPath())).toBe(false);
	});

	it('refreshes when the refresh token itself is about to expire, even with a fresh access token', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 50 * MINUTE, refreshTokenExpiresInMs: 20 * MINUTE });

		expect(await getAccessToken()).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(getOAuthMetadata()!.refreshTokenExpiresAt).toBeGreaterThan(Date.now() + DAY);
	});

	it('keeps the previous refresh token when the server does not rotate it', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse({ refresh_token: undefined }));
		await seedSession({ expiresInMs: 30_000 });

		await getAccessToken();

		expect(await getOAuthRefreshToken()).toBe('rt_1');
	});

	it('refreshes at most once per process', async () => {
		// The new token is itself nearly expired, so a second call would want to refresh again.
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse({ expires_in: 10 }));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken()).toBe('tok_new');
		expect(await getAccessToken()).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('shares one refresh between concurrent callers', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });

		const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

		expect(results).toEqual(['tok_new', 'tok_new', 'tok_new']);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('honours a larger minRemainingMs', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 20 * MINUTE });

		expect(await getAccessToken()).toBe('tok_old');
		expect(fetchSpy).not.toHaveBeenCalled();

		expect(await getAccessToken({ minRemainingMs: 45 * MINUTE })).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('reports an expired session without a network call when the refresh token is gone', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await seedSession({ expiresInMs: -1000, refreshTokenExpiresInMs: -1000 });

		await expect(getAccessToken()).rejects.toBeInstanceOf(OAuthSessionExpiredError);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it('clears the session when the server rejects the refresh token after hard expiry', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthError('invalid_grant'));
		await seedSession({ expiresInMs: -1000 });

		await expect(getAccessToken()).rejects.toBeInstanceOf(OAuthSessionExpiredError);

		expect(getOAuthMetadata()).toBeUndefined();
		expect(await getOAuthRefreshToken()).toBeUndefined();
		expect(await getToken()).toBe('tok_old');
	});

	it('falls back to the still-valid stored token when an early refresh is rejected', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthError('invalid_grant'));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken()).toBe('tok_old');
		expect(getOAuthMetadata()).toBeDefined();
	});

	it('adopts the tokens written by a concurrent process that won the refresh race', async () => {
		await seedSession({ expiresInMs: 30_000 });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
			// The other process rotated everything while our request was in flight.
			await setOAuthRefreshToken('rt_other');
			await setToken('tok_other');
			setOAuthMetadata({ ...getOAuthMetadata()!, expiresAt: Date.now() + HOUR });
			return oauthError('invalid_grant');
		});

		expect(await getAccessToken()).toBe('tok_other');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(await getOAuthRefreshToken()).toBe('rt_other');
	});

	it('survives a network error while the stored token is still valid', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken()).toBe('tok_old');
	});

	it('fails with a network message once the stored token is past expiry', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
		await seedSession({ expiresInMs: -1000 });

		await expect(getAccessToken()).rejects.toThrow(/Could not refresh your Apify session/);
		expect(getOAuthMetadata()).toBeDefined();
	});

	it('removes a stale refresh lock and proceeds', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });
		mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
		writeFileSync(lockPath(), '12345');
		const minuteAgo = (Date.now() - MINUTE) / 1000;
		utimesSync(lockPath(), minuteAgo, minuteAgo);

		expect(await getAccessToken()).toBe('tok_new');
		expect(existsSync(lockPath())).toBe(false);
	});

	it('saveOAuthSession stores the tokens and clearOAuthSession forgets them', async () => {
		await saveOAuthSession(
			{ access_token: 'tok_login', token_type: 'Bearer', expires_in: 3599, refresh_token: 'rt_login' },
			{ issuer: ISSUER, clientId: CLIENT_ID, tokenEndpoint: TOKEN_ENDPOINT },
		);

		expect(await getToken()).toBe('tok_login');
		expect(await getOAuthRefreshToken()).toBe('rt_login');
		expect(getOAuthMetadata()).toMatchObject({ issuer: ISSUER, clientId: CLIENT_ID, tokenEndpoint: TOKEN_ENDPOINT });

		await clearOAuthSession();

		expect(getOAuthMetadata()).toBeUndefined();
		expect(await getOAuthRefreshToken()).toBeUndefined();
		expect(await getToken()).toBe('tok_login');
	});

	it('getLocalUserInfo hands out the refreshed token and hides the oauth state', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
		writeFileSync(AUTH_FILE_PATH(), JSON.stringify({ id: 'uid', username: 'me' }));
		await seedSession({ expiresInMs: 30_000 });

		const info = await getLocalUserInfo();

		expect(info.token).toBe('tok_new');
		expect(info).not.toHaveProperty('oauth');
		expect(readAuthFile().oauth).toMatchObject({ issuer: ISSUER });
	});
});
