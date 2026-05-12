import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

import { KeyValueStoresRenameCommandMessages } from '#i18n/commands/key-value-stores/rename.js';

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
			this.logger.stderr.error(this.t(KeyValueStoresRenameCommandMessages.missingNameOrUnname));
			return;
		}

		if (newName && unname) {
			this.logger.stderr.error(this.t(KeyValueStoresRenameCommandMessages.conflictingNameAndUnname));
			return;
		}

		const client = await getLoggedClientOrThrow();
		const existingDataset = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingDataset) {
			this.logger.stderr.error(
				this.t(KeyValueStoresRenameCommandMessages.storeNotFound, { nameOrId: keyValueStoreNameOrId }),
			);

			return;
		}

		const { id, name } = existingDataset.keyValueStore;

		const successMessage = (() => {
			if (!name) {
				return this.t(KeyValueStoresRenameCommandMessages.nameSet, { id, newName: newName! });
			}

			if (unname) {
				return this.t(KeyValueStoresRenameCommandMessages.nameRemoved, { id, name });
			}

			return this.t(KeyValueStoresRenameCommandMessages.nameChanged, { id, name, newName: newName! });
		})();

		try {
			await existingDataset.keyValueStoreClient.update({ name: unname ? (null as never) : newName! });

			this.logger.stdout.success(successMessage);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				this.t(KeyValueStoresRenameCommandMessages.renameFailed, {
					id,
					message: String(casted.message || casted),
				}),
			);
		}
	}
}
