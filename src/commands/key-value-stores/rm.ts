import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { getApifyStorageClient } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, success } from '../../lib/outputs.js';

export class KeyValueStoresRmCommand extends ApifyCommand<typeof KeyValueStoresRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes a key-value store.';

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The key-value store ID or name to delete',
			required: true,
		}),
	};

	static override requiresAuthentication = 'optionally' as const;

	async run() {
		const { keyValueStoreNameOrId } = this.args;

		const client = await getApifyStorageClient(this.apifyClient);

		const existingKvs = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingKvs) {
			error({
				message: `Key-value store with ID or name "${keyValueStoreNameOrId}" not found.`,
			});

			return;
		}

		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to delete this Key-value store?`,
		});

		if (!confirmed) {
			info({ message: 'Key-value store deletion has been aborted.' });
			return;
		}

		const { id, name } = existingKvs.keyValueStore;

		try {
			await existingKvs.keyValueStoreClient.delete();

			success({
				message: `Key-value store with ID ${chalk.yellow(id)}${name ? ` (called ${chalk.yellow(name)})` : ''} has been deleted.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to delete key-value store with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
