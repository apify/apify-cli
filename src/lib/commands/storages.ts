import type {
	DatasetClient,
	DatasetInfo as CoreDatasetInfo,
	KeyValueStoreClient,
	KeyValueStoreInfo as CoreKeyValueStoreInfo,
	StorageClient,
} from '@crawlee/types';
import type { Dataset as ApifyDataset, KeyValueStore as ApifyKeyValueStore } from 'apify-client';
import { ApifyClient } from 'apify-client';

type DatasetInfo = CoreDatasetInfo & Partial<ApifyDataset>;
type KeyValueStoreInfo = CoreKeyValueStoreInfo & Partial<ApifyKeyValueStore>;

type ReturnTypeForStorage<T extends 'dataset' | 'keyValueStore'> = T extends 'dataset'
	? { dataset: DatasetInfo; datasetClient: DatasetClient }
	: { keyValueStore: KeyValueStoreInfo; keyValueStoreClient: KeyValueStoreClient };

async function tryToGetStorage<T extends 'dataset' | 'keyValueStore'>(
	client: StorageClient,
	id: string,
	storageType: T,
): Promise<ReturnTypeForStorage<T> | null> {
	const byIdOrName = await client[storageType](id)
		.get()
		.catch(() => undefined);

	if (byIdOrName) {
		return {
			[storageType]: byIdOrName,
			[`${storageType}Client`]: client[storageType](byIdOrName.id),
		} as ReturnTypeForStorage<T>;
	}

	if (!(client instanceof ApifyClient)) {
		return null;
	}

	const info = await client.user('me').get();

	const byName = await client[storageType](`${info.username!}/${id}`)
		.get()
		.catch(() => undefined);

	if (byName) {
		// @ts-expect-error WHY DOES THIS NOT TYPECHECK :((
		return {
			[storageType]: byName,
			[`${storageType}Client`]: client[storageType](byName.id),
		} as ReturnTypeForStorage<T>;
	}
	return null;
}

export async function tryToGetDataset(
	client: StorageClient,
	datasetId: string,
): Promise<{ dataset: DatasetInfo; datasetClient: DatasetClient } | null> {
	return tryToGetStorage(client, datasetId, 'dataset');
}

export async function tryToGetKeyValueStore(
	client: StorageClient,
	keyValueStoreId: string,
): Promise<{ keyValueStore: KeyValueStoreInfo; keyValueStoreClient: KeyValueStoreClient } | null> {
	return tryToGetStorage(client, keyValueStoreId, 'keyValueStore');
}
