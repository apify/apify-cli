import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, info } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';
import { confirmAction } from '../../lib/utils/confirm.js';

export class KeyValueStoresDeleteValueCommand extends ApifyCommand<typeof KeyValueStoresDeleteValueCommand> {
	static override name = 'delete-value' as const;

	static override description = 'Delete a value from a key-value store.';

	static override args = {
		'store id': Args.string({
			description: 'The key-value store ID to delete the value from.',
			required: true,
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
		}),
	};

	async run() {
		const { storeId, itemKey } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetKeyValueStore(apifyClient, storeId);

		if (!maybeStore) {
			error({
				message: `Key-value store with ID or name "${storeId}" not found.`,
			});

			return;
		}

		const { keyValueStoreClient: client } = maybeStore;

		const existing = await client.getRecord(itemKey);

		if (!existing) {
			error({
				message: `Item with key "${itemKey}" not found in the key-value store.`,
			});
			return;
		}

		const confirm = await confirmAction({
			type: 'record',
		});

		if (!confirm) {
			info({ message: 'Key-value store record deletion aborted.', stdout: true });
			return;
		}

		try {
			await client.deleteRecord(itemKey);
			info({
				message: `Record with key "${chalk.yellow(itemKey)}" deleted from the key-value store.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to delete record with key "${itemKey}" from the key-value store.\n  ${casted.message || casted}`,
			});
		}
	}
}
