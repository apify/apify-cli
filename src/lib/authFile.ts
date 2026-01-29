import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { ApifyClient, type ApifyClientOptions } from 'apify-client';
import { AxiosHeaders } from 'axios';

import { APIFY_CLIENT_DEFAULT_HEADERS, AUTH_FILE_PATH } from './consts.js';
import { ensureApifyDirectory } from './utils.js';

export interface AuthJSONv1 {
	token?: string;
	id?: string;
	username?: string;
	email?: string;
	proxy?: {
		password: string;
	};
	organizationOwnerUserId?: string;
}

export interface StoredLoginInfo {
	token: string;
	id: string;
	username: string;
	email: string;
	/** Stored mainly to detect if this is an organization */
	organizationOwnerUserId?: string;

	/** Base URL of the Apify API, to be passed to Apify Client. Allows Apify devs to use localhost or staging backends. */
	baseUrl?: string;
}

interface AuthJSONv2 {
	version: 2;
	// invariant: defaultUserId is null iff the logins array is empty
	defaultUserId: string | null;
	logins: StoredLoginInfo[];
}

const corruptedAuthFileError = () =>
	new Error(
		`Corrupted local user info was found. Please remove the file ${AUTH_FILE_PATH()} and run "apify login" to fix it.`,
	);

/**
 * Returns info about logins stored for all available backends.
 */
export const getAllLocalUserInfos = async (): Promise<{ logins: StoredLoginInfo[]; defaultUserId: string | null }> => {
	let loadedConfig: AuthJSONv1 | AuthJSONv2 = {};
	try {
		const raw = await readFile(AUTH_FILE_PATH(), 'utf-8');
		loadedConfig = JSON.parse(raw) as AuthJSONv1 | AuthJSONv2;
	} catch {
		return { logins: [], defaultUserId: null };
	}

	if ('version' in loadedConfig) {
		if (loadedConfig.version === 2) {
			// -> happy path
			return loadedConfig;
		}
		throw new Error(`Unsupported auth file version: ${loadedConfig.version}`);
	}

	// Migrate v1 to v2
	if (!loadedConfig.username || !loadedConfig.id) {
		throw corruptedAuthFileError();
	}

	return {
		logins: [
			{
				token: loadedConfig.token!,
				id: loadedConfig.id!,
				username: loadedConfig.username!,
				email: loadedConfig.email!,
			},
		],
		defaultUserId: loadedConfig.id!,
	};
};

/**
 * Returns info about the selected user, or about the default user. Returns undefined if no (matching) login is found.
 */
const getLocalUserInfo = async ({
	selectedUsernameOrId,
}: {
	selectedUsernameOrId: string | null;
}): Promise<StoredLoginInfo | undefined> => {
	const { defaultUserId, logins } = await getAllLocalUserInfos();

	if (!defaultUserId) {
		if (logins.length > 0) throw corruptedAuthFileError();
		return undefined;
	}

	const target = selectedUsernameOrId ?? defaultUserId;
	const result = logins.find((login) => login.id === target || login.username === target);

	if (result) return result;

	if (!selectedUsernameOrId)
		// we searched for the default user, but it was not found
		throw corruptedAuthFileError();
	throw new Error(`No stored login info found for selected ID/username: ${selectedUsernameOrId}.`);
};

/**
 * Persists auth info for the current backend.
 */
async function storeLocalUserInfo(
	userInfo: StoredLoginInfo,
	{ updateExisting, makeDefault }: { updateExisting: boolean; makeDefault: boolean },
) {
	ensureApifyDirectory(AUTH_FILE_PATH());

	const allInfos: AuthJSONv2 = { ...(await getAllLocalUserInfos()), version: 2 };
	const index = allInfos.logins.findIndex((login) => login.id === userInfo.id);
	const foundExisting = index !== -1;

	if (!foundExisting && updateExisting) {
		throw new Error(
			`No existing login info for ID/username: ${userInfo.id || userInfo.username}. Cannot update non-existing login.`,
		);
	}

	if (foundExisting && !updateExisting) {
		throw new Error(`User ${userInfo.id} (${userInfo.username}) is already logged in.`);
	}

	if (foundExisting) {
		allInfos.logins[index] = userInfo;
	} else {
		allInfos.logins.push(userInfo);
		// TODO: makeDefault isn't set from anywhere right now,
		// we always just make the first login the default
		if (makeDefault || allInfos.logins.length === 1) {
			allInfos.defaultUserId = userInfo.id;
		}
	}

	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(allInfos, null, '\t'));
}

/**
 * Removes auth info for the given user - effectively logs out the user.
 *
 * Returns username and id of the removed user, or null if a user with this username or ID was not found.
 */
export async function clearLocalUserInfo(usernameOrId?: string): Promise<null | { username: string; id: string }> {
	const allInfos = await getAllLocalUserInfos();

	const index = allInfos.logins.findIndex((login) => login.id === usernameOrId || login.username === usernameOrId);
	if (index === -1) return null;

	const info = allInfos.logins[index];
	const wasDefault = allInfos.defaultUserId === allInfos.logins[index].id;
	allInfos.logins.splice(index, 1);

	if (wasDefault) {
		// TODO: pick the new default more intelligently?
		allInfos.defaultUserId = allInfos.logins.length > 0 ? allInfos.logins[0].id : null;
	}
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(allInfos, null, '\t'));
	return { username: info.username, id: info.id };
}

// biome-ignore format: off
type CJSAxiosHeaders = import('axios', { with: { 'resolution-mode': 'require' } }).AxiosRequestConfig['headers'];

type GetLoggedClientOptions =
	| { token: string; storeAsNewUser?: boolean; baseUrl: string | undefined; publicBaseUrl?: string }
	| { usernameOrId: string | undefined };

/**
 * Gets instance of ApifyClient for token or for params from global auth file.
 * NOTE: It refreshes global auth file each run
 */
export async function getLoggedClient(options: GetLoggedClientOptions): Promise<ApifyClient | null> {
	const clientOptions: ApifyClientOptions = {
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

	let updateExisting = true;

	if ('token' in options) {
		clientOptions.token = options.token;
		clientOptions.baseUrl = options.baseUrl;
		clientOptions.publicBaseUrl = options.publicBaseUrl;
		updateExisting = !options.storeAsNewUser;
	} else {
		const userInfo = await getLocalUserInfo({ selectedUsernameOrId: options.usernameOrId ?? null });
		if (!userInfo) {
			return null;
		}
		clientOptions.token = userInfo.token;
		// Hard setting both URLs from base URL is not ideal... But stored logins are hopefully only used for local development,
		// not on Apify platform, so there won't be a special (cloud intranet) base URL needed.
		clientOptions.baseUrl = userInfo.baseUrl;
		clientOptions.publicBaseUrl = userInfo.baseUrl;
	}

	const apifyClient = new ApifyClient(clientOptions);

	let userInfo;
	try {
		userInfo = await apifyClient.user('me').get();
	} catch {
		return null;
	}

	// avoid storing
	if ('token' in options && !options.storeAsNewUser) return apifyClient;

	// Always refresh Auth file
	await storeLocalUserInfo(
		{
			token: clientOptions.token!,
			id: userInfo.id!,
			username: userInfo.username,
			email: userInfo.email!,
			organizationOwnerUserId: (userInfo as any).organizationOwnerUserId,
			baseUrl: clientOptions.baseUrl,
		},
		{ updateExisting, makeDefault: false },
	);

	return apifyClient;
}
