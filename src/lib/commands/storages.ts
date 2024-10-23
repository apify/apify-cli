import type { ApifyClient, Dataset, DatasetClient, KeyValueStore, KeyValueStoreClient } from 'apify-client';

import { getLocalUserInfo } from '../utils.js';

type ReturnTypeForStorage<T extends 'dataset' | 'keyValueStore'> = T extends 'dataset'
	? {
			dataset: Dataset;
			datasetClient: DatasetClient;
		}
	: { keyValueStore: KeyValueStore; keyValueStoreClient: KeyValueStoreClient };

async function tryToGetStorage<T extends 'dataset' | 'keyValueStore'>(
	client: ApifyClient,
	id: string,
	storageType: T,
): Promise<ReturnTypeForStorage<T> | null> {
	const byIdOrName = await client
		.dataset(id)
		.get()
		.catch(() => undefined);

	if (byIdOrName) {
		return {
			[storageType]: byIdOrName,
			[`${storageType}Client`]: client[storageType](byIdOrName.id),
		} as ReturnTypeForStorage<T>;
	}

	const info = await getLocalUserInfo();

	const byName = await client[storageType](`${info.username!}/${id}`)
		.get()
		.catch(() => undefined);

	if (byName) {
		return {
			[storageType]: byName,
			[`${storageType}Client`]: client[storageType](byName.id),
		} as ReturnTypeForStorage<T>;
	}

	return null;
}

export async function tryToGetDataset(
	client: ApifyClient,
	datasetId: string,
): Promise<{ dataset: Dataset | undefined; datasetClient: DatasetClient } | null> {
	return tryToGetStorage(client, datasetId, 'dataset');
}

export async function tryToGetKeyValueStore(
	client: ApifyClient,
	keyValueStoreId: string,
): Promise<{ keyValueStore: KeyValueStore | undefined; keyValueStoreClient: KeyValueStoreClient } | null> {
	return tryToGetStorage(client, keyValueStoreId, 'keyValueStore');
}
