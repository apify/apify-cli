import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { cryptoRandomObjectId } from '@apify/utilities';

import { __resetAuthFileForTests, type AuthProfile } from '../../../../src/lib/auth-file.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../../src/lib/consts.js';
import { __resetCredentialsForTests, getSecret, setSecret } from '../../../../src/lib/credentials.js';
import {
	__resetOAuthSessionForTests,
	clearOAuthSession,
	getAccessToken,
	OAuthSessionExpiredError,
	saveOAuthSession,
} from '../../../../src/lib/oauth/session.js';
import { getLocalUserInfo } from '../../../../src/lib/utils.js';
import { readActiveProfile, TEST_USER_ID, v2AuthFile } from '../../../__setup__/auth-file.js';
import { resetKeyringMock } from '../../../__setup__/keyring-mock.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ISSUER = 'https://issuer.test';
const CLIENT_ID = 'https://client.test/oauth-client.json';
const TOKEN_ENDPOINT = `${ISSUER}/oauth/apps/token`;
const OAUTH = { issuer: ISSUER, clientId: CLIENT_ID, tokenEndpoint: TOKEN_ENDPOINT };

const lockPath = () => join(GLOBAL_CONFIGS_FOLDER(), `oauth-refresh-${TEST_USER_ID}.lock`);
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const writeProfile = (profile: Partial<AuthProfile>) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(v2AuthFile(profile)));
};

/** A stored OAuth login: the profile carries the state, the secrets go wherever the backend puts them. */
const seedSession = async ({
	token = 'tok_old',
	refreshToken = 'rt_1',
	expiresInMs = HOUR,
	refreshTokenExpiresInMs = 60 * DAY,
}: { token?: string; refreshToken?: string; expiresInMs?: number; refreshTokenExpiresInMs?: number } = {}) => {
	writeProfile({
		authMethod: 'oauth2',
		expiresAt: iso(expiresInMs),
		hasRefreshToken: true,
		oauth: { ...OAUTH, refreshTokenExpiresAt: iso(refreshTokenExpiresInMs) },
	});
	await setSecret(TEST_USER_ID, 'token', token);
	await setSecret(TEST_USER_ID, 'refresh-token', refreshToken);
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

const storedToken = () => getSecret(TEST_USER_ID, 'token');
const storedRefreshToken = () => getSecret(TEST_USER_ID, 'refresh-token');

describe.each([
	['file', '1'],
	['keyring', ''],
])('oauth session on the %s backend', (_backend, disableKeyring) => {
	beforeEach(() => {
		vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', cryptoRandomObjectId(12));
		vitest.stubEnv('APIFY_DISABLE_KEYRING', disableKeyring);
		vitest.stubEnv('APIFY_TOKEN', '');
		resetKeyringMock();
		__resetCredentialsForTests();
		__resetAuthFileForTests();
		__resetOAuthSessionForTests();
	});

	afterEach(async () => {
		await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		vitest.unstubAllEnvs();
		__resetCredentialsForTests();
		__resetAuthFileForTests();
		__resetOAuthSessionForTests();
		process.exitCode = undefined;
	});

	it('passes a plain API token through without touching the network', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		writeProfile({});
		await setSecret(TEST_USER_ID, 'token', 'apify_api_plain');

		expect(await getAccessToken(TEST_USER_ID)).toBe('apify_api_plain');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns the stored token while it is fresh', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await seedSession({ expiresInMs: 30 * MINUTE });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_old');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refreshes an expiring token and stores the rotated pair on the profile', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });
		const before = Date.now();

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_new');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe(TOKEN_ENDPOINT);
		expect(formBody(fetchSpy.mock.calls[0][1])).toEqual({
			grant_type: 'refresh_token',
			refresh_token: 'rt_1',
			client_id: CLIENT_ID,
		});

		expect(await storedToken()).toBe('tok_new');
		expect(await storedRefreshToken()).toBe('rt_2');
		const profile = readActiveProfile()!;
		expect(profile.authMethod).toBe('oauth2');
		expect(profile.hasRefreshToken).toBe(true);
		expect(Date.parse(profile.expiresAt!)).toBeGreaterThanOrEqual(before + 3599_000);
		expect(Date.parse(profile.oauth!.refreshTokenExpiresAt!)).toBeGreaterThanOrEqual(before + 5183999_000);
		expect(existsSync(lockPath())).toBe(false);
	});

	it('refreshes when the refresh token itself is about to expire, even with a fresh access token', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 50 * MINUTE, refreshTokenExpiresInMs: 20 * MINUTE });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(Date.parse(readActiveProfile()!.oauth!.refreshTokenExpiresAt!)).toBeGreaterThan(Date.now() + DAY);
	});

	it('keeps the previous refresh token when the server does not rotate it', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse({ refresh_token: undefined }));
		await seedSession({ expiresInMs: 30_000 });

		await getAccessToken(TEST_USER_ID);

		expect(await storedRefreshToken()).toBe('rt_1');
		expect(readActiveProfile()!.hasRefreshToken).toBe(true);
	});

	it('refreshes at most once per process', async () => {
		// The new token is itself nearly expired, so a second call would want to refresh again.
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse({ expires_in: 10 }));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_new');
		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('shares one refresh between concurrent callers', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });

		const results = await Promise.all([
			getAccessToken(TEST_USER_ID),
			getAccessToken(TEST_USER_ID),
			getAccessToken(TEST_USER_ID),
		]);

		expect(results).toEqual(['tok_new', 'tok_new', 'tok_new']);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('honours a larger minRemainingMs', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 20 * MINUTE });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_old');
		expect(fetchSpy).not.toHaveBeenCalled();

		expect(await getAccessToken(TEST_USER_ID, { minRemainingMs: 45 * MINUTE })).toBe('tok_new');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('reports an expired session without a network call when the refresh token is gone', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await seedSession({ expiresInMs: -1000, refreshTokenExpiresInMs: -1000 });

		await expect(getAccessToken(TEST_USER_ID)).rejects.toBeInstanceOf(OAuthSessionExpiredError);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('turns the login into a plain-token one when the server rejects the refresh token after hard expiry', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthError('invalid_grant'));
		await seedSession({ expiresInMs: -1000 });

		await expect(getAccessToken(TEST_USER_ID)).rejects.toBeInstanceOf(OAuthSessionExpiredError);

		const profile = readActiveProfile()!;
		expect(profile.authMethod).toBe('token');
		expect(profile.oauth).toBeUndefined();
		expect(profile.hasRefreshToken).toBe(false);
		expect(await storedRefreshToken()).toBeUndefined();
		expect(await storedToken()).toBe('tok_old');
	});

	it('falls back to the still-valid stored token when an early refresh is rejected', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthError('invalid_grant'));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_old');
		expect(readActiveProfile()!.authMethod).toBe('oauth2');
	});

	it('adopts the tokens written by a concurrent process that won the refresh race', async () => {
		await seedSession({ expiresInMs: 30_000 });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
			// The other process rotated everything while our request was in flight.
			await setSecret(TEST_USER_ID, 'refresh-token', 'rt_other');
			await setSecret(TEST_USER_ID, 'token', 'tok_other');
			return oauthError('invalid_grant');
		});

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_other');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(await storedRefreshToken()).toBe('rt_other');
	});

	it('survives a network error while the stored token is still valid', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
		await seedSession({ expiresInMs: 30_000 });

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_old');
	});

	it('fails with a network message once the stored token is past expiry, and does not retry', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
		await seedSession({ expiresInMs: -1000 });

		await expect(getAccessToken(TEST_USER_ID)).rejects.toThrow(/Could not refresh your Apify session/);
		await expect(getAccessToken(TEST_USER_ID)).rejects.toThrow(/Could not refresh your Apify session/);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(readActiveProfile()!.authMethod).toBe('oauth2');
	});

	it('removes a stale refresh lock and proceeds', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });
		writeFileSync(lockPath(), '12345');
		const minuteAgo = (Date.now() - MINUTE) / 1000;
		utimesSync(lockPath(), minuteAgo, minuteAgo);

		expect(await getAccessToken(TEST_USER_ID)).toBe('tok_new');
		expect(existsSync(lockPath())).toBe(false);
	});

	it('saveOAuthSession stores the tokens and clearOAuthSession forgets them', async () => {
		writeProfile({});

		await saveOAuthSession(
			TEST_USER_ID,
			{ access_token: 'tok_login', token_type: 'Bearer', expires_in: 3599, refresh_token: 'rt_login' },
			OAUTH,
		);

		expect(await storedToken()).toBe('tok_login');
		expect(await storedRefreshToken()).toBe('rt_login');
		expect(readActiveProfile()).toMatchObject({ authMethod: 'oauth2', hasRefreshToken: true, oauth: OAUTH });

		await clearOAuthSession(TEST_USER_ID);

		expect(readActiveProfile()).toMatchObject({ authMethod: 'token', expiresAt: null, hasRefreshToken: false });
		expect(readActiveProfile()!.oauth).toBeUndefined();
		expect(await storedRefreshToken()).toBeUndefined();
		expect(await storedToken()).toBe('tok_login');
	});

	it('getLocalUserInfo hands out the refreshed token', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse());
		await seedSession({ expiresInMs: 30_000 });

		const info = await getLocalUserInfo();

		expect(info.token).toBe('tok_new');
		expect(info).not.toHaveProperty('oauth');
	});
});
