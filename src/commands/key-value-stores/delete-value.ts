import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresDeleteValueCommand extends ApifyCommand<typeof KeyValueStoresDeleteValueCommand> {
	static override name = 'delete-value' as const;

	static override description = 'Delete a value from a key-value store.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting the record. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete a single record by key.',
			command: 'apify key-value-stores delete-value <storeId> OUTPUT',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-key-value-stores-delete-value';

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

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { storeId, itemKey } = this.args;
		const { yes } = this.flags;

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

		const confirm = await useYesNoConfirm({
			message: `Are you sure you want to delete this record?`,
			providedConfirmFromStdin: yes || undefined,
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
