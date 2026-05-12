import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

import { KeyValueStoresRmCommandMessages } from '#i18n/commands/key-value-stores/rm.js';

export class KeyValueStoresRmCommand extends ApifyCommand<typeof KeyValueStoresRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes a key-value store.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete a key-value store (prompts for confirmation).',
			command: 'apify key-value-stores rm my-store',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-key-value-stores-rm';

	static override args = {
		keyValueStoreNameOrId: Args.string({
			description: 'The key-value store ID or name to delete.',
			required: true,
		}),
	};

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { keyValueStoreNameOrId } = this.args;
		const { yes } = this.flags;

		const client = await getLoggedClientOrThrow();

		const existingKvs = await tryToGetKeyValueStore(client, keyValueStoreNameOrId);

		if (!existingKvs) {
			this.logger.stderr.error(
				this.t(KeyValueStoresRmCommandMessages.storeNotFound, { nameOrId: keyValueStoreNameOrId }),
			);

			return;
		}

		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to delete this Key-value store?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmed) {
			this.logger.stderr.info(this.t(KeyValueStoresRmCommandMessages.deletionAborted));
			return;
		}

		const { id, name } = existingKvs.keyValueStore;

		try {
			await existingKvs.keyValueStoreClient.delete();

			this.logger.stdout.success(
				name
					? this.t(KeyValueStoresRmCommandMessages.deletedNamed, { id, name })
					: this.t(KeyValueStoresRmCommandMessages.deletedUnnamed, { id }),
			);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				this.t(KeyValueStoresRmCommandMessages.deleteFailed, { id, message: String(casted.message || casted) }),
			);
		}
	}
}
