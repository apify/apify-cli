import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresSetValueCommand extends ApifyCommand<typeof KeyValueStoresSetValueCommand> {
	static override name = 'set-value';

	static override description = 'Stores value with specified key. Set content-type with --content-type flag.';

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
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
		}),
		value: Args.string({
			description: 'The value to set.',
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
