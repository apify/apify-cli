import { closeSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { AUTH_FILE_PATH, CommandExitCodes, GLOBAL_CONFIGS_FOLDER } from '../consts.js';
import {
	clearOAuthState,
	getOAuthMetadata,
	getOAuthRefreshToken,
	getToken,
	type OAuthMetadata,
	setOAuthMetadata,
	setOAuthRefreshToken,
	setToken,
} from '../credentials.js';
import { ensureApifyDirectory } from '../files.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { REFRESH_TOKEN_RENEW_BEFORE_MS, TOKEN_REFRESH_SKEW_MS } from './consts.js';
import { OAuthError, refreshAccessToken, type TokenResponse } from './token-endpoint.js';

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

// Cross-process guard for the refresh: refresh tokens rotate, so two CLIs refreshing at once would
// invalidate each other. Best effort — a stuck lock is ignored after a short wait.
const LOCK_FILE_NAME = 'oauth-refresh.lock';
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 100;
const LOCK_MAX_POLLS = 50;

export class OAuthSessionExpiredError extends Error {
	override name = 'OAuthSessionExpiredError';

	constructor() {
		super('Your Apify login session has expired. Run "apify login" to sign in again.');
	}
}

let cached: { token: string; expiresAt: number } | undefined;
let refreshedThisProcess = false;
let inflightRefresh: Promise<string | undefined> | undefined;

/** Test-only: forget the in-process token cache and refresh state. */
export function __resetOAuthSessionForTests() {
	cached = undefined;
	refreshedThisProcess = false;
	inflightRefresh = undefined;
}

export interface AccessTokenOptions {
	/** Refresh when the access token has less than this left. Defaults to `TOKEN_REFRESH_SKEW_MS`. */
	minRemainingMs?: number;
}

/**
 * The stored access token, refreshed first when it is about to expire. Plain API-token logins have no
 * OAuth metadata and pass straight through. Refreshes at most once per process.
 */
export async function getAccessToken({ minRemainingMs = TOKEN_REFRESH_SKEW_MS }: AccessTokenOptions = {}): Promise<
	string | undefined
> {
	const metadata = getOAuthMetadata();
	if (!metadata) return getToken();

	const now = Date.now();

	if (!needsRefresh(metadata, now, minRemainingMs)) {
		if (cached && cached.expiresAt === metadata.expiresAt) return cached.token;
		const token = await getToken();
		if (token) cached = { token, expiresAt: metadata.expiresAt };
		return token;
	}

	if (metadata.refreshTokenExpiresAt !== undefined && metadata.refreshTokenExpiresAt <= now) {
		process.exitCode = CommandExitCodes.MissingAuth;
		throw new OAuthSessionExpiredError();
	}

	if (refreshedThisProcess) return cached?.token ?? getToken();

	inflightRefresh ??= refreshSession(metadata, minRemainingMs).finally(() => {
		inflightRefresh = undefined;
	});
	return inflightRefresh;
}

/** Persists a fresh token response after login. */
export async function saveOAuthSession(
	tokens: TokenResponse,
	metadata: Pick<OAuthMetadata, 'issuer' | 'clientId' | 'tokenEndpoint'>,
): Promise<void> {
	await persistTokens(tokens, metadata);
}

export async function clearOAuthSession(): Promise<void> {
	await clearOAuthState();
	cached = undefined;
}

function needsRefresh(metadata: OAuthMetadata, now: number, minRemainingMs: number): boolean {
	if (metadata.expiresAt - now < minRemainingMs) return true;
	return (
		metadata.refreshTokenExpiresAt !== undefined && metadata.refreshTokenExpiresAt - now < REFRESH_TOKEN_RENEW_BEFORE_MS
	);
}

async function refreshSession(metadata: OAuthMetadata, minRemainingMs: number): Promise<string | undefined> {
	const releaseLock = await acquireRefreshLock();

	try {
		// Another process may have refreshed while this one waited for the lock.
		const latest = getOAuthMetadata() ?? metadata;
		if (!needsRefresh(latest, Date.now(), minRemainingMs)) {
			const token = await getToken();
			if (token) cached = { token, expiresAt: latest.expiresAt };
			return token;
		}

		const refreshToken = await getOAuthRefreshToken();
		if (!refreshToken) {
			await clearOAuthSession();
			process.exitCode = CommandExitCodes.MissingAuth;
			throw new OAuthSessionExpiredError();
		}

		let tokens: TokenResponse;
		try {
			tokens = await refreshAccessToken({
				tokenEndpoint: latest.tokenEndpoint,
				clientId: latest.clientId,
				refreshToken,
			});
		} catch (err) {
			return handleRefreshFailure(err, latest, refreshToken);
		}

		await persistTokens(tokens, latest);
		refreshedThisProcess = true;
		return tokens.access_token;
	} finally {
		releaseLock();
	}
}

async function handleRefreshFailure(
	err: unknown,
	metadata: OAuthMetadata,
	usedRefreshToken: string,
): Promise<string | undefined> {
	cliDebugPrint('oauth', 'refresh failed', err);

	const rejected = err instanceof OAuthError && (err.code === 'invalid_grant' || err.code === 'expired_token');

	if (rejected) {
		// A concurrent process may have rotated the refresh token first; its result is already stored.
		const stored = await getOAuthRefreshToken();
		if (stored && stored !== usedRefreshToken) {
			const token = await getToken();
			const current = getOAuthMetadata();
			if (token && current) cached = { token, expiresAt: current.expiresAt };
			return token;
		}
	}

	// Refreshing happens ahead of expiry, so the stored token usually still works for this command.
	if (Date.now() < metadata.expiresAt) {
		return getToken();
	}

	if (rejected) {
		await clearOAuthSession();
		process.exitCode = CommandExitCodes.MissingAuth;
		throw new OAuthSessionExpiredError();
	}

	throw new Error('Could not refresh your Apify session. Check your connection or run "apify login".');
}

/**
 * Write order matters because the server rotates the refresh token: the new refresh token lands first,
 * so a crash mid-way leaves a session the next run can still refresh.
 */
async function persistTokens(
	tokens: TokenResponse,
	metadata: Pick<OAuthMetadata, 'issuer' | 'clientId' | 'tokenEndpoint'> & Partial<OAuthMetadata>,
): Promise<void> {
	const now = Date.now();
	const expiresAt = now + (tokens.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
	const refreshTokenExpiresAt =
		tokens.refresh_token_expires_in !== undefined
			? now + tokens.refresh_token_expires_in * 1000
			: metadata.refreshTokenExpiresAt;

	if (tokens.refresh_token) {
		await setOAuthRefreshToken(tokens.refresh_token, { skipIfUnchanged: true });
	}
	await setToken(tokens.access_token, { skipIfUnchanged: true });
	setOAuthMetadata({
		issuer: metadata.issuer,
		clientId: metadata.clientId,
		tokenEndpoint: metadata.tokenEndpoint,
		expiresAt,
		refreshTokenExpiresAt,
	});

	cached = { token: tokens.access_token, expiresAt };
}

async function acquireRefreshLock(): Promise<() => void> {
	const lockPath = join(GLOBAL_CONFIGS_FOLDER(), LOCK_FILE_NAME);
	const release = () => {
		try {
			unlinkSync(lockPath);
		} catch {
			// Already gone.
		}
	};
	const noop = () => {};

	try {
		ensureApifyDirectory(AUTH_FILE_PATH());
	} catch {
		return noop;
	}

	for (let attempt = 0; attempt < LOCK_MAX_POLLS; attempt++) {
		try {
			const fd = openSync(lockPath, 'wx');
			writeSync(fd, `${process.pid}`);
			closeSync(fd);
			return release;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return noop;
		}

		try {
			if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
				unlinkSync(lockPath);
				continue;
			}
		} catch {
			// Released between the failed open and the stat; retry immediately.
			continue;
		}

		await sleep(LOCK_POLL_MS);
	}

	cliDebugPrint('oauth', 'refresh lock wait timed out; continuing without it');
	return noop;
}
