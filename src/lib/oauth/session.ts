import { closeSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { lookUpProfile, type OAuthProfileState, updateProfileAuth } from '../auth-file.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../consts.js';
import { deleteSecret, getSecret, setSecret } from '../credentials.js';
import { ensureApifyDirectory } from '../files.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { REFRESH_TOKEN_RENEW_BEFORE_MS, TOKEN_REFRESH_SKEW_MS } from './consts.js';
import { OAuthError, refreshAccessToken, type TokenResponse } from './token-endpoint.js';

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

// Cross-process guard for the refresh: refresh tokens rotate, so two CLIs refreshing at once would
// invalidate each other. Best effort — a stuck lock is ignored after a short wait.
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 100;
const LOCK_MAX_POLLS = 50;

/** The stored OAuth session cannot produce a usable access token; the message says what to do. */
export class OAuthSessionError extends Error {
	override name = 'OAuthSessionError';
}

export class OAuthSessionExpiredError extends OAuthSessionError {
	override name = 'OAuthSessionExpiredError';

	constructor() {
		super('Your Apify login session has expired. Run "apify login" to sign in again.');
	}
}

/** The profile's OAuth state with the expiries as epoch ms, or undefined for a plain API token. */
interface OAuthMetadata extends OAuthProfileState {
	expiresAt: number;
	refreshTokenExpiresAtMs?: number;
}

interface SessionState {
	cached?: { token: string; expiresAt: number };
	// One network refresh per process: a second attempt would only repeat the outcome, or a 30 s timeout.
	refreshAttempted: boolean;
	refreshFailure?: Error;
	inflightRefresh?: Promise<string | undefined>;
}

const sessions = new Map<string, SessionState>();

function sessionOf(userId: string): SessionState {
	let state = sessions.get(userId);
	if (!state) {
		state = { refreshAttempted: false };
		sessions.set(userId, state);
	}
	return state;
}

/** Test-only: forget the in-process token caches and refresh state. */
export function __resetOAuthSessionForTests() {
	sessions.clear();
}

export interface AccessTokenOptions {
	/** Refresh when the access token has less than this left. Defaults to `TOKEN_REFRESH_SKEW_MS`. */
	minRemainingMs?: number;
}

function readMetadata(userId: string): OAuthMetadata | undefined {
	const { profile } = lookUpProfile(userId);
	if (profile?.authMethod !== 'oauth2' || !profile.oauth || !profile.expiresAt) return undefined;

	const expiresAt = Date.parse(profile.expiresAt);
	if (!Number.isFinite(expiresAt)) return undefined;

	const refreshTokenExpiresAtMs = profile.oauth.refreshTokenExpiresAt
		? Date.parse(profile.oauth.refreshTokenExpiresAt)
		: undefined;

	return {
		...profile.oauth,
		expiresAt,
		...(Number.isFinite(refreshTokenExpiresAtMs) ? { refreshTokenExpiresAtMs } : {}),
	};
}

/**
 * The stored access token of a profile, refreshed first when it is about to expire. Plain API-token
 * logins have no OAuth state and pass straight through. Refreshes at most once per process.
 */
export async function getAccessToken(
	userId: string,
	{ minRemainingMs = TOKEN_REFRESH_SKEW_MS }: AccessTokenOptions = {},
): Promise<string | undefined> {
	const metadata = readMetadata(userId);
	if (!metadata) return getSecret(userId, 'token');

	const state = sessionOf(userId);
	const now = Date.now();

	if (!needsRefresh(metadata, now, minRemainingMs)) {
		if (state.cached && state.cached.expiresAt === metadata.expiresAt) return state.cached.token;
		const token = await getSecret(userId, 'token');
		if (token) state.cached = { token, expiresAt: metadata.expiresAt };
		return token;
	}

	if (metadata.refreshTokenExpiresAtMs !== undefined && metadata.refreshTokenExpiresAtMs <= now) {
		throw new OAuthSessionExpiredError();
	}

	if (state.refreshAttempted) {
		if (state.refreshFailure) throw state.refreshFailure;
		return state.cached?.token ?? getSecret(userId, 'token');
	}

	state.inflightRefresh ??= refreshSession(userId, state, metadata, minRemainingMs)
		.catch((err: Error) => {
			state.refreshFailure = err;
			throw err;
		})
		.finally(() => {
			state.inflightRefresh = undefined;
		});
	return state.inflightRefresh;
}

/** Persists a fresh token response after login. The profile must already be stored. */
export async function saveOAuthSession(
	userId: string,
	tokens: TokenResponse,
	metadata: Pick<OAuthProfileState, 'issuer' | 'clientId' | 'tokenEndpoint'>,
): Promise<void> {
	await persistTokens(userId, tokens, { ...metadata, refreshTokenExpiresAt: null });
}

/** Turns an OAuth login back into a plain-token one: the refresh token goes, the access token stays. */
export async function clearOAuthSession(userId: string): Promise<void> {
	sessions.delete(userId);

	const leftover = await deleteSecret(userId, 'refresh-token');
	if (leftover) cliDebugPrint('oauth', 'the keyring kept the refresh token', leftover.error);

	if (lookUpProfile(userId).profile?.authMethod === 'oauth2') {
		updateProfileAuth(userId, { authMethod: 'token', expiresAt: null, hasRefreshToken: false });
	}
}

function needsRefresh(metadata: OAuthMetadata, now: number, minRemainingMs: number): boolean {
	if (metadata.expiresAt - now < minRemainingMs) return true;
	return (
		metadata.refreshTokenExpiresAtMs !== undefined &&
		metadata.refreshTokenExpiresAtMs - now < REFRESH_TOKEN_RENEW_BEFORE_MS
	);
}

async function refreshSession(
	userId: string,
	state: SessionState,
	metadata: OAuthMetadata,
	minRemainingMs: number,
): Promise<string | undefined> {
	const releaseLock = await acquireRefreshLock(userId);

	try {
		// Another process may have refreshed while this one waited for the lock.
		const latest = readMetadata(userId) ?? metadata;
		if (!needsRefresh(latest, Date.now(), minRemainingMs)) {
			const token = await getSecret(userId, 'token');
			if (token) state.cached = { token, expiresAt: latest.expiresAt };
			return token;
		}

		// Not cleared here: a keyring read can fail transiently, and `apify login` drops the session anyway.
		const refreshToken = await getSecret(userId, 'refresh-token');
		if (!refreshToken) throw new OAuthSessionExpiredError();

		state.refreshAttempted = true;

		let tokens: TokenResponse;
		try {
			tokens = await refreshAccessToken({
				tokenEndpoint: latest.tokenEndpoint,
				clientId: latest.clientId,
				refreshToken,
			});
		} catch (err) {
			return handleRefreshFailure(userId, state, err, latest, refreshToken);
		}

		await persistTokens(userId, tokens, latest);
		return tokens.access_token;
	} finally {
		releaseLock();
	}
}

async function handleRefreshFailure(
	userId: string,
	state: SessionState,
	err: unknown,
	metadata: OAuthMetadata,
	usedRefreshToken: string,
): Promise<string | undefined> {
	cliDebugPrint('oauth', 'refresh failed', err);

	const rejected = err instanceof OAuthError && (err.code === 'invalid_grant' || err.code === 'expired_token');

	if (rejected) {
		// A concurrent process may have rotated the refresh token first; its result is already stored.
		const stored = await getSecret(userId, 'refresh-token');
		if (stored && stored !== usedRefreshToken) {
			const token = await getSecret(userId, 'token');
			const current = readMetadata(userId);
			if (token && current) state.cached = { token, expiresAt: current.expiresAt };
			return token;
		}
	}

	// Refreshing happens ahead of expiry, so the stored token usually still works for this command.
	if (Date.now() < metadata.expiresAt) {
		return getSecret(userId, 'token');
	}

	if (rejected) {
		await clearOAuthSession(userId);
		throw new OAuthSessionExpiredError();
	}

	throw new OAuthSessionError('Could not refresh your Apify session. Check your connection or run "apify login".');
}

/**
 * Write order matters because the server rotates the refresh token: the new refresh token lands first,
 * so a crash mid-way leaves a session the next run can still refresh.
 */
async function persistTokens(userId: string, tokens: TokenResponse, metadata: OAuthProfileState): Promise<void> {
	const now = Date.now();
	const expiresAt = now + (tokens.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
	const refreshTokenExpiresAt =
		tokens.refresh_token_expires_in !== undefined
			? new Date(now + tokens.refresh_token_expires_in * 1000).toISOString()
			: metadata.refreshTokenExpiresAt;

	if (tokens.refresh_token) {
		await setSecret(userId, 'refresh-token', tokens.refresh_token, { skipIfUnchanged: true });
	}
	await setSecret(userId, 'token', tokens.access_token, { skipIfUnchanged: true });
	updateProfileAuth(userId, {
		authMethod: 'oauth2',
		expiresAt: new Date(expiresAt).toISOString(),
		hasRefreshToken: Boolean(tokens.refresh_token) || (await getSecret(userId, 'refresh-token')) !== undefined,
		oauth: {
			issuer: metadata.issuer,
			clientId: metadata.clientId,
			tokenEndpoint: metadata.tokenEndpoint,
			refreshTokenExpiresAt,
		},
	});

	sessionOf(userId).cached = { token: tokens.access_token, expiresAt };
}

async function acquireRefreshLock(userId: string): Promise<() => void> {
	const lockPath = join(GLOBAL_CONFIGS_FOLDER(), `oauth-refresh-${userId}.lock`);
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
