import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { ApifyClient, type ApifyClientOptions } from 'apify-client';
import { AxiosHeaders } from 'axios';

import { APIFY_ENV_VARS } from '@apify/consts';

import { APIFY_CLIENT_DEFAULT_HEADERS, AUTH_FILE_PATH } from './consts.js';
import { ensureMigrated, getBackend, getToken, setProxyPassword, setToken } from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

export type TokenSource = 'flag' | 'env' | 'stored';

export interface ResolvedAuth {
	token: string;
	source: TokenSource;
}

/** Where a resolved token came from, for messages that need to name it. */
export const TOKEN_SOURCE_LABELS: Record<TokenSource, string> = {
	flag: '--token flag',
	env: `${APIFY_ENV_VARS.TOKEN} environment variable`,
	stored: 'apify login',
};

/**
 * The single token resolver. Order: a token the command was given -> `APIFY_TOKEN` -> stored
 * login. Only `login` and `mcp install` take a token of their own, through `--token`; every
 * other command uses `APIFY_TOKEN` to run as a different account.
 *
 * Inside a platform run there is no stored login, so `APIFY_TOKEN` wins without a special case
 * for the `actor` entrypoint.
 *
 * Read-only by contract: no caller of this function persists anything. Only `apify login`
 * writes credentials, through {@link loginWithToken}.
 */
export const resolveAuth = async (explicitToken?: string): Promise<ResolvedAuth | undefined> => {
	if (explicitToken) {
		return { token: explicitToken, source: 'flag' };
	}

	const envToken = process.env[APIFY_ENV_VARS.TOKEN];
	if (envToken) {
		return { token: envToken, source: 'env' };
	}

	await ensureMigrated();

	const storedToken = await getToken();
	if (storedToken) {
		return { token: storedToken, source: 'stored' };
	}

	return undefined;
};

/**
 * Message for a token that the API rejected, or for having no token at all. `error` is the
 * failure the lookup produced, so an unreachable API is not reported as a bad token.
 */
export async function describeAuthFailure(error?: unknown): Promise<string> {
	const auth = await resolveAuth();

	if (!auth) {
		return 'You are not logged in with your Apify account. Call "apify login" to fix that.';
	}

	// Only the API can reject a token, so a failure that carries no auth status is something else.
	const statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
	if (error && statusCode !== 401 && statusCode !== 403) {
		const reason = error instanceof Error ? error.message : String(error);
		return `Could not verify your API token. The Apify API request failed: ${reason}`;
	}

	switch (auth.source) {
		case 'flag':
			return 'The API token passed with --token was rejected. Check the token and try again.';
		case 'env':
			return `The API token in ${APIFY_ENV_VARS.TOKEN} was rejected. Unset it to use your stored login instead.`;
		default:
			return 'Your stored API token was rejected. Call "apify login" to log in again.';
	}
}

type CJSAxiosHeaders = import('axios', { with: { 'resolution-mode': 'require' } }).AxiosRequestConfig['headers'];

/**
 * Returns options for ApifyClient
 */
export const getApifyClientOptions = async (token?: string, apiBaseUrl?: string): Promise<ApifyClientOptions> => {
	const auth = await resolveAuth(token);

	return {
		token: auth?.token,
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
	};
};

/**
 * Authenticates `token` and saves it together with the account metadata. This is the only
 * credential writer in the CLI — every other code path resolves tokens without persisting them.
 *
 * Returns `null` when the token is rejected, in which case nothing is written.
 */
export async function loginWithToken(token: string, apiBaseUrl?: string): Promise<ApifyClient | null> {
	const apifyClient = new ApifyClient(await getApifyClientOptions(token, apiBaseUrl));

	let userInfo;
	try {
		userInfo = await apifyClient.user('me').get();
	} catch (err) {
		cliDebugPrint('[loginWithToken] error getting user info', { error: err, apiBaseUrl });
		return null;
	}

	// Replaces the previous account rather than merging into it, so fields the new account
	// does not have (email, organizationOwnerUserId) cannot linger from the old one.
	const fileContents: Record<string, unknown> = { ...userInfo, secretsBackend: await getBackend() };
	delete fileContents.token;
	if (fileContents.proxy && typeof fileContents.proxy === 'object') {
		const { password: _password, ...rest } = fileContents.proxy as { password?: string };
		if (Object.keys(rest).length > 0) {
			fileContents.proxy = rest;
		} else {
			delete fileContents.proxy;
		}
	}

	ensureApifyDirectory(AUTH_FILE_PATH());
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(fileContents, null, '\t'), { mode: 0o600 });

	// Secrets are written after the metadata file so the file backend, which stores them in
	// auth.json too, is not overwritten. `skipIfUnchanged` avoids a macOS Keychain prompt
	// when the value already matches.
	await setToken(token, { skipIfUnchanged: true });

	const proxyPassword = userInfo.proxy?.password;
	if (proxyPassword) {
		await setProxyPassword(proxyPassword, { skipIfUnchanged: true });
	}

	return apifyClient;
}
