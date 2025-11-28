import process from 'node:process';
import { pipeline } from 'node:stream/promises';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { StorageClient } from '@crawlee/types';
import type { ApifyClient } from 'apify-client';

import { ACTOR_ENV_VARS, APIFY_ENV_VARS, KEY_VALUE_STORE_KEYS, LOCAL_ACTOR_ENV_VARS } from '@apify/consts';

import { getLocalStorageDir } from './utils.js';

export const APIFY_STORAGE_TYPES = {
	KEY_VALUE_STORE: 'KEY_VALUE_STORE',
	DATASET: 'DATASET',
	REQUEST_QUEUE: 'REQUEST_QUEUE',
} as const;

/**
 * Returns instance of ApifyClient or ApifyStorageLocal based on environment variables.
 * @param apifyClient - ApifyClient instance to use if local storage is not used.
 * @param forceCloud - If true then ApifyClient will be returned.
 */
export const getApifyStorageClient = async (
	apifyClient: ApifyClient | undefined,
	forceCloud = Reflect.has(process.env, APIFY_ENV_VARS.IS_AT_HOME),
): Promise<StorageClient> => {
	const storageDir = getLocalStorageDir();

	if (storageDir && !forceCloud) {
		return new MemoryStorage({
			localDataDirectory: storageDir,
		});
	}

	if (!apifyClient) {
		throw new Error('ApifyClient instance must be provided when not using local storage.');
	}

	return apifyClient;
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
 *
 * @param apifyClient - ApifyClient instance to use if local storage is not used.
 * @param key - Record key
 */
export const outputRecordFromDefaultStore = async (apifyClient: ApifyClient | undefined, key: string) => {
	const client = await getApifyStorageClient(apifyClient);
	const defaultStoreId = getDefaultStorageId(APIFY_STORAGE_TYPES.KEY_VALUE_STORE);
	const record = await client.keyValueStore(defaultStoreId).getRecord(key, { stream: true });
	// If record does not exist return empty string.
	if (!record) return;

	await pipeline(record.value, process.stdout, { end: false });
};

export const outputInputFromDefaultStore = async (apifyClient: ApifyClient | undefined) => {
	return outputRecordFromDefaultStore(
		apifyClient,
		process.env[ACTOR_ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT,
	);
};
