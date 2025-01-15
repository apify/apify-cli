import { Args, Flags } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresRenameCommand extends ApifyCommand<typeof KeyValueStoresRenameCommand> {
	static override description = 'Renames a key-value store, or removes its unique name.';

	static override hiddenAliases = ['kvs:rename'];

	static override flags = {
		unname: Flags.boolean({
			description: 'Removes the unique name of the key-value store',
		}),
	};

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The key-value store ID or name to delete',
			required: true,
		}),
		newName: Args.string({
			description: 'The new name for the key-value store',
		}),
	};

	async run() {
		const { unname } = this.flags;
		const { newName, keyValueStoreNameOrId } = this.args;

		if (!newName && !unname) {
			error({ message: 'You must provide either a new name or the --unname flag.' });
			return;
		}

		if (newName && unname) {
			error({
				message: 'You cannot provide a new name and the --unname flag.',
			});
			return;
		}

		const client = await getLoggedClientOrThrow();
		const existingDataset = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingDataset) {
			error({
				message: `Key-value store with ID or name "${keyValueStoreNameOrId}" not found.`,
			});

			return;
		}

		const { id, name } = existingDataset.keyValueStore;

		const successMessage = (() => {
			if (!name) {
				return `The name of the key-value store with ID ${chalk.yellow(id)} has been set to: ${chalk.yellow(newName)}`;
			}

			if (unname) {
				return `The name of the key-value store with ID ${chalk.yellow(id)} has been removed (was ${chalk.yellow(name)} previously).`;
			}

			return `The name of the key-value store with ID ${chalk.yellow(id)} was changed from ${chalk.yellow(name)} to ${chalk.yellow(newName)}.`;
		})();

		try {
			await existingDataset.keyValueStoreClient.update({ name: unname ? (null as never) : newName! });

			success({
				message: successMessage,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to rename key-value store with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
