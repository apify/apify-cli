import { existsSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { ApifyApiError, ApifyClient, type ApifyClientOptions } from 'apify-client';
import { AxiosHeaders } from 'axios';

import { APIFY_ENV_VARS } from '@apify/consts';

import { APIFY_CLIENT_DEFAULT_HEADERS, AUTH_FILE_PATH, CommandExitCodes } from './consts.js';
import {
	deleteProxyPassword,
	ensureMigrated,
	getBackend,
	getToken,
	setProxyPassword,
	setToken,
	stripProxyPassword,
} from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { warning } from './outputs.js';
import type { AuthJSON } from './types.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

export type TokenSource = 'env' | 'stored';

export interface ResolvedAuth {
	token: string;
	source: TokenSource;
}

/**
 * Values that mean the variable was never really set: `APIFY_TOKEN=$UNSET_VAR` leaves an empty
 * string, and templating an absent value writes the literal "undefined".
 */
const PLACEHOLDER_TOKENS = new Set(['undefined', 'null', 'nil', 'none', 'nan', 'false', '0', '-']);

/**
 * What `APIFY_TOKEN` holds. Blank and placeholder values are distinct: the first means nobody set
 * it, the second means someone meant to and got it wrong. Collapsing them left `login` and
 * `logout` unable to see a value that every other command rejects.
 */
export type EnvToken = { kind: 'unset' } | { kind: 'invalid'; raw: string } | { kind: 'token'; token: string };

export function readEnvToken(): EnvToken {
	const raw = process.env[APIFY_ENV_VARS.TOKEN]?.trim();
	if (!raw) return { kind: 'unset' };
	if (PLACEHOLDER_TOKENS.has(raw.toLowerCase())) return { kind: 'invalid', raw };
	return { kind: 'token', token: raw };
}

/** One wording for an `APIFY_TOKEN` set to something unusable, whether it aborts or only warns. */
export function invalidEnvTokenMessage(raw: string): string {
	return `${APIFY_ENV_VARS.TOKEN} is set to "${raw}", which is not an API token. Unset ${APIFY_ENV_VARS.TOKEN} and try again.`;
}

/** Where a resolved token came from, for messages that need to name it. */
export const TOKEN_SOURCE_LABELS: Record<TokenSource, string> = {
	env: `${APIFY_ENV_VARS.TOKEN} environment variable`,
	stored: 'apify login',
};

let authPromise: Promise<ResolvedAuth | undefined> | undefined;

/** Test-only: drop the resolved token so each test resolves afresh. */
export function __resetAuthForTests() {
	authPromise = undefined;
}

/**
 * The single token resolver. Order: `APIFY_TOKEN` -> stored login. Inside a platform run there is
 * no stored login, so `APIFY_TOKEN` wins without a special case for the `actor` entrypoint.
 *
 * Single-flighted like {@link getBackend}, because several callers resolve per command and reading
 * the stored token is an uncached OS keyring hit.
 *
 * Read-only by contract, apart from the one-shot migration of an existing plaintext auth.json.
 * Only `apify login` writes credentials, through {@link loginWithToken}.
 *
 * Throws when `APIFY_TOKEN` holds a placeholder value.
 */
export const resolveAuth = async (): Promise<ResolvedAuth | undefined> => {
	authPromise ??= (async () => {
		await ensureMigrated();

		const envToken = readEnvToken();
		if (envToken.kind === 'invalid') {
			process.exitCode = CommandExitCodes.InvalidInput;
			throw new Error(invalidEnvTokenMessage(envToken.raw));
		}

		if (envToken.kind === 'token') {
			if (existsSync(AUTH_FILE_PATH())) {
				warning({ message: `Using the API token from ${APIFY_ENV_VARS.TOKEN}.` });
			}

			return { token: envToken.token, source: 'env' } as const;
		}

		const storedToken = await getToken();
		return storedToken ? ({ token: storedToken, source: 'stored' } as const) : undefined;
	})();

	try {
		return await authPromise;
	} catch (err) {
		// A rejected promise would otherwise be replayed to every later caller in this process.
		authPromise = undefined;
		throw err;
	}
};

export function describeAuthFailure(auth: ResolvedAuth | undefined, error?: unknown): string {
	if (!auth) {
		return 'You are not logged in with your Apify account. Call "apify login" to fix that.';
	}

	// Only the API can reject a token, so a failure that carries no auth status is something else.
	const statusCode = error instanceof ApifyApiError ? error.statusCode : undefined;
	if (error && statusCode !== 401 && statusCode !== 403) {
		const reason = error instanceof Error ? error.message : String(error);
		return `Could not verify your API token. The Apify API request failed: ${reason}`;
	}

	switch (auth.source) {
		case 'env':
			return `The API token in ${APIFY_ENV_VARS.TOKEN} was rejected. Unset it to use your stored login instead.`;
		default:
			return 'Your stored API token was rejected. Call "apify login" to log in again.';
	}
}

type CJSAxiosHeaders = import('axios', { with: { 'resolution-mode': 'require' } }).AxiosRequestConfig['headers'];

/** Base URL and headers, with no token and so no credential lookup. */
export const getAnonymousApifyClientOptions = (apiBaseUrl?: string): ApifyClientOptions => ({
	baseUrl: apiBaseUrl || process.env.APIFY_CLIENT_BASE_URL,
	requestInterceptors: [
		(config) => {
			config.headers ??= new AxiosHeaders() as CJSAxiosHeaders;

			for (const [key, value] of Object.entries(APIFY_CLIENT_DEFAULT_HEADERS)) {
				config.headers![key] = value;
			}

			return config;
		},
	],
});

/** Options for a caller that already holds a token, so nothing is resolved. */
export const getApifyClientOptionsForToken = (token: string, apiBaseUrl?: string): ApifyClientOptions => ({
	...getAnonymousApifyClientOptions(apiBaseUrl),
	token,
});

/** The only credential writer in the CLI. Returns `null` when the token is rejected, writing nothing. */
export async function loginWithToken(
	token: string,
	apiBaseUrl?: string,
): Promise<{ client: ApifyClient; userInfo: AuthJSON } | null> {
	const apifyClient = new ApifyClient(getApifyClientOptionsForToken(token, apiBaseUrl));

	let userInfo;
	try {
		userInfo = await apifyClient.user('me').get();
	} catch (err) {
		cliDebugPrint('[loginWithToken] error getting user info', { error: err, apiBaseUrl });
		return null;
	}

	const proxyPassword = userInfo.proxy?.password;

	// Replaces the previous account rather than merging, so stale fields cannot linger. The spread
	// is shallow, so stripping here also clears userInfo.proxy — read the password first.
	const fileContents = { ...userInfo, secretsBackend: await getBackend() };
	stripProxyPassword(fileContents);

	ensureApifyDirectory(AUTH_FILE_PATH());
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(fileContents, null, '\t'), { mode: 0o600 });

	// After the metadata file, which would clobber them on the file backend. `skipIfUnchanged` avoids a Keychain prompt.
	await setToken(token, { skipIfUnchanged: true });

	if (proxyPassword) {
		await setProxyPassword(proxyPassword, { skipIfUnchanged: true });
	} else {
		await deleteProxyPassword();
	}

	return { client: apifyClient, userInfo };
}
