import process from 'node:process';
import { pipeline } from 'node:stream/promises';

import { ACTOR_ENV_VARS, APIFY_ENV_VARS, KEY_VALUE_STORE_KEYS, LOCAL_ACTOR_ENV_VARS } from '@apify/consts';
import { MemoryStorage, MemoryStorageOptions } from '@crawlee/memory-storage';
import { StorageClient } from '@crawlee/types';
import { ApifyClient, ApifyClientOptions } from 'apify-client';
// Will this work, who knows
import ow from 'ow';

import { getApifyClientOptions, getLocalStorageDir, getLocalUserInfo } from './utils.js';

export const APIFY_STORAGE_TYPES = {
	KEY_VALUE_STORE: 'KEY_VALUE_STORE',
	DATASET: 'DATASET',
	REQUEST_QUEUE: 'REQUEST_QUEUE',
} as const;

/**
 * Returns instance of ApifyClient or ApifyStorageLocal based on environment variables.
 * @param options - ApifyClient options
 * @param forceCloud - If true then ApifyClient will be returned.
 */
export const getApifyStorageClient = async (
	options: MemoryStorageOptions | ApifyClientOptions = {},
	forceCloud = Reflect.has(process.env, APIFY_ENV_VARS.IS_AT_HOME),
): Promise<StorageClient> => {
	const storageDir = getLocalStorageDir();

	if (storageDir && !forceCloud) {
		return new MemoryStorage({
			localDataDirectory: storageDir,
			...options,
		});
	}

	// NOTE: Token in env var overrides token in local auth file.
	let apifyToken = process.env[APIFY_ENV_VARS.TOKEN];
	if (!apifyToken) {
		const localUserInfo = await getLocalUserInfo();
		if (!localUserInfo || !localUserInfo.token) {
			throw new Error(
				'Apify token is not set. Please set it using the environment variable APIFY_TOKEN or apify login command.',
			);
		}

		apifyToken = localUserInfo.token;
	}

	return new ApifyClient({
		...getApifyClientOptions(apifyToken),
		...options,
	});
};

/**
 * Returns default storage id based on environment variables.
 * Throws error if not set and Actor running on platform.
 * @param storeType
 */
export const getDefaultStorageId = (storeType: (typeof APIFY_STORAGE_TYPES)[keyof typeof APIFY_STORAGE_TYPES]) => {
	const envVarName = ACTOR_ENV_VARS[`DEFAULT_${storeType}_ID`];

	return process.env[envVarName] || LOCAL_ACTOR_ENV_VARS[envVarName];
};

/**
 * Outputs value of record into standard output of the command.
 * @param key - Record key
 */
export const outputRecordFromDefaultStore = async (key: string) => {
	ow(key, ow.string);

	const apifyClient = await getApifyStorageClient();
	const defaultStoreId = getDefaultStorageId(APIFY_STORAGE_TYPES.KEY_VALUE_STORE);
	const record = await apifyClient.keyValueStore(defaultStoreId).getRecord(key, { stream: true });
	// If record does not exist return empty string.
	if (!record) return;

	await pipeline(record.value, process.stdout, { end: false });
};

export const outputInputFromDefaultStore = async () => {
	return outputRecordFromDefaultStore(process.env[ACTOR_ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT);
};
