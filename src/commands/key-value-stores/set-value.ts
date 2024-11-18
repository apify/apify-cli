import { Args, Flags } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresSetValueCommand extends ApifyCommand<typeof KeyValueStoresSetValueCommand> {
	static override description = 'Sets a value in a key-value store.';

	static override hiddenAliases = ['kvs:set-value'];

	static override flags = {
		'content-type': Flags.string({
			description: 'The MIME content type of the value. By default, "application/json" is assumed.',
			default: 'application/json',
		}),
	};

	static override args = {
		storeId: Args.string({
			description: 'The key-value store ID to set the value in.',
			required: true,
			ignoreStdin: true,
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
			ignoreStdin: true,
		}),
		value: Args.string({
			description: 'The value to set.',
			ignoreStdin: true,
		}),
	};

	async run() {
		const { storeId, itemKey, value } = this.args;
		const { contentType } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetKeyValueStore(apifyClient, storeId);

		if (!maybeStore) {
			error({
				message: `Key-value store with ID or name "${storeId}" not found.`,
			});

			return;
		}

		const { keyValueStoreClient: client } = maybeStore;

		try {
			// TODO: again, the types need to be fixed -w-
			await client.setRecord({ key: itemKey, value: (value || process.stdin) as string, contentType });

			success({
				message: `Value with key "${itemKey}" set in the key-value store.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to set value with key "${itemKey}" in the key-value store.\n  ${casted.message || casted}`,
			});
		}
	}
}
