import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresRenameCommand extends ApifyCommand<typeof KeyValueStoresRenameCommand> {
	static override name = 'rename' as const;

	static override description = 'Renames a key-value store, or removes its unique name.';

	static override examples = [
		{
			description: 'Rename a key-value store.',
			command: 'apify key-value-stores rename old-name new-name',
		},
		{
			description: 'Remove the name from a key-value store.',
			command: 'apify key-value-stores rename my-store --unname',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-key-value-stores-rename';

	static override flags = {
		unname: Flags.boolean({
			description: 'Removes the unique name of the key-value store.',
		}),
	};

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The key-value store ID or name to delete.',
			required: true,
		}),
		newName: Args.string({
			description: 'The new name for the key-value store.',
		}),
	};

	async run() {
		const { unname } = this.flags;
		const { newName, keyValueStoreNameOrId } = this.args;

		if (!newName && !unname) {
			this.logger.stderr.error('You must provide either a new name or the --unname flag.');
			return;
		}

		if (newName && unname) {
			this.logger.stderr.error('You cannot provide a new name and the --unname flag.');
			return;
		}

		const client = await getLoggedClientOrThrow();
		const existingDataset = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingDataset) {
			this.logger.stderr.error(`Key-value store with ID or name "${keyValueStoreNameOrId}" not found.`);

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

			this.logger.stdout.success(successMessage);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				`Failed to rename key-value store with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			);
		}
	}
}
