import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresRmCommand extends ApifyCommand<typeof KeyValueStoresRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes a key-value store.';

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The key-value store ID or name to delete',
			required: true,
		}),
	};

	async run() {
		const { keyValueStoreNameOrId } = this.args;

		const client = await getLoggedClientOrThrow();

		const existingKvs = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingKvs) {
			this.logger.stderr.error(`Key-value store with ID or name "${keyValueStoreNameOrId}" not found.`);

			return;
		}

		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to delete this Key-value store?`,
		});

		if (!confirmed) {
			this.logger.stderr.info('Key-value store deletion has been aborted.');
			return;
		}

		const { id, name } = existingKvs.keyValueStore;

		try {
			await existingKvs.keyValueStoreClient.delete();

			this.logger.stdout.success(
				`Key-value store with ID ${chalk.yellow(id)}${name ? ` (called ${chalk.yellow(name)})` : ''} has been deleted.`,
			);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				`Failed to delete key-value store with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			);
		}
	}
}
