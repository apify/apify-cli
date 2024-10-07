import { Args, Flags } from '@oclif/core';
import type { ApifyClient, KeyValueStore, KeyValueStoreClient } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresGetValueCommand extends ApifyCommand<typeof KeyValueStoresGetValueCommand> {
	static override description = 'Gets a value by key in the given key-value store.';

	static override flags = {
		'only-content-type': Flags.boolean({
			description: 'Only return the content type of the specified key',
			default: false,
		}),
	};

	static override args = {
		keyValueStoreId: Args.string({
			description: 'The key-value store ID to get the value from.',
			required: true,
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
		}),
	};

	async run() {
		const { onlyContentType } = this.flags;
		const { keyValueStoreId, itemKey } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await this.tryToGetKeyValueStore(apifyClient, keyValueStoreId);

		if (!maybeStore) {
			return;
		}

		const { storeClient } = maybeStore;

		const itemRecord = await storeClient.getRecord(itemKey, { stream: true });

		if (!itemRecord) {
			error({ message: `Item with key "${itemKey}" not found in the key-value store.` });
			return;
		}

		// Print out the content-type on stderr (default to octet-stream for unknown content types)
		simpleLog({ message: itemRecord.contentType ?? 'application/octet-stream' });

		if (onlyContentType) {
			// Close the stream as otherwise the process hangs
			itemRecord.value.destroy();
			return;
		}

		// pipe the output to stdout
		itemRecord.value.pipe(process.stdout);
	}

	private async tryToGetKeyValueStore(
		client: ApifyClient,
		keyValueStoreId: string,
	): Promise<{ store: KeyValueStore | undefined; storeClient: KeyValueStoreClient } | null> {
		const byIdOrName = await client
			.keyValueStore(keyValueStoreId)
			.get()
			.catch(() => undefined);

		if (byIdOrName) {
			return {
				store: byIdOrName,
				storeClient: client.keyValueStore(byIdOrName.id),
			};
		}

		const info = await getLocalUserInfo();

		const byName = await client
			.keyValueStore(`${info.username!}/${keyValueStoreId}`)
			.get()
			.catch(() => undefined);

		if (byName) {
			return {
				store: byName,
				storeClient: client.keyValueStore(byName.id),
			};
		}

		error({ message: `Key-value store with ID "${keyValueStoreId}" not found.` });

		return null;
	}
}
