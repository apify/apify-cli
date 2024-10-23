import { Args } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { confirmAction } from '../../lib/commands/confirm.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresRmCommand extends ApifyCommand<typeof KeyValueStoresRmCommand> {
	static override description = 'Deletes a Key-value Store';

	static override hiddenAliases = ['kvs:rm'];

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The Key-value Store ID or name to delete',
			required: true,
		}),
	};

	async run() {
		const { keyValueStoreNameOrId } = this.args;

		const client = await getLoggedClientOrThrow();

		const existingKvs = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingKvs) {
			error({
				message: `Key-value Store with ID or name "${keyValueStoreNameOrId}" not found.`,
			});

			return;
		}

		const confirmed = await confirmAction({ type: 'Key-value Store' });

		if (!confirmed) {
			info({ message: 'Key-value Store deletion has been aborted.' });
			return;
		}

		const { id, name } = existingKvs.keyValueStore;

		try {
			await existingKvs.keyValueStoreClient.delete();

			success({
				message: `Key-value Store with ID ${chalk.yellow(id)}${name ? ` (called ${chalk.yellow(name)})` : ''} has been deleted.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to delete Key-value Store with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
