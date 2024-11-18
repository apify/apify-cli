import { Args, Flags } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Key', 'Size'],
	mandatoryColumns: ['Key', 'Size'],
});

export class KeyValueStoresKeysCommand extends ApifyCommand<typeof KeyValueStoresKeysCommand> {
	static override description = 'Lists all keys in a key-value store.';

	static override hiddenAliases = ['kvs:keys'];

	static override flags = {
		limit: Flags.integer({
			description: 'The maximum number of keys to return.',
			default: 20,
		}),
		exclusiveStartKey: Flags.string({
			description: 'The key to start the list from.',
		}),
	};

	static override args = {
		storeId: Args.string({
			description: 'The key-value store ID to list keys for.',
			required: true,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { storeId } = this.args;
		const { limit, exclusiveStartKey } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetKeyValueStore(apifyClient, storeId);

		if (!maybeStore) {
			error({
				message: `Key-value store with ID or name "${storeId}" not found.`,
			});

			return;
		}

		const { keyValueStoreClient: client } = maybeStore;

		const keys = await client.listKeys({ limit, exclusiveStartKey });

		if (this.flags.json) {
			return keys;
		}

		for (const keyData of keys.items) {
			table.pushRow({
				Key: keyData.key,
				Size: prettyPrintBytes({ bytes: keyData.size, shortBytes: true, precision: 0 }),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});

		return undefined;
	}
}
