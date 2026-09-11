import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { ApifyClient, type ApifyClientOptions } from 'apify-client';
import { AxiosHeaders } from 'axios';

import { APIFY_CLIENT_DEFAULT_HEADERS, AUTH_FILE_PATH } from './consts.js';
import { ensureMigrated, getBackend, getToken, setProxyPassword, setToken } from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

export type TokenSource = 'flag' | 'stored';

export interface ResolvedAuth {
	token: string;
	source: TokenSource;
}

/**
 * The single token resolver. Order: `--token` flag -> stored login.
 *
 * Read-only by contract: no caller of this function persists anything. Only `apify login`
 * writes credentials, through {@link loginWithToken}.
 */
export const resolveAuth = async (explicitToken?: string): Promise<ResolvedAuth | undefined> => {
	if (explicitToken) {
		return { token: explicitToken, source: 'flag' };
	}

	await ensureMigrated();

	const storedToken = await getToken();
	if (storedToken) {
		return { token: storedToken, source: 'stored' };
	}

	return undefined;
};

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
