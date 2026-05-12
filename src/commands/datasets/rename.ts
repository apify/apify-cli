import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

import { DatasetsRenameCommandMessages } from '#i18n/commands/datasets/rename.js';

export class DatasetsRenameCommand extends ApifyCommand<typeof DatasetsRenameCommand> {
	static override name = 'rename' as const;

	static override description = 'Change the dataset name or remove the name with --unname flag.';

	static override examples = [
		{
			description: 'Rename a dataset.',
			command: 'apify datasets rename old-name new-name',
		},
		{
			description: 'Remove the name from a dataset (makes it unnamed).',
			command: 'apify datasets rename my-dataset --unname',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets-rename';

	static override flags = {
		unname: Flags.boolean({
			description: 'Removes the unique name of the dataset.',
		}),
	};

	static override args = {
		nameOrId: Args.string({
			description: 'The dataset ID or name to delete.',
			required: true,
		}),
		newName: Args.string({
			description: 'The new name for the dataset.',
		}),
	};

	async run() {
		const { unname } = this.flags;
		const { newName, nameOrId } = this.args;

		if (!newName && !unname) {
			this.logger.stderr.error(this.t(DatasetsRenameCommandMessages.mustProvideNameOrUnname));
			return;
		}

		if (newName && unname) {
			this.logger.stderr.error(this.t(DatasetsRenameCommandMessages.cannotProvideBoth));
			return;
		}

		const client = await getLoggedClientOrThrow();
		const existingDataset = await tryToGetDataset(client, nameOrId);

		if (!existingDataset) {
			this.logger.stderr.error(this.t(DatasetsRenameCommandMessages.datasetNotFound, { nameOrId }));

			return;
		}

		const { id, name } = existingDataset.dataset;

		const successMessage = (() => {
			if (!name) {
				return this.t(DatasetsRenameCommandMessages.nameSet, { id, newName: newName! });
			}

			if (unname) {
				return this.t(DatasetsRenameCommandMessages.nameRemoved, { id, previousName: name });
			}

			return this.t(DatasetsRenameCommandMessages.nameChanged, { id, previousName: name, newName: newName! });
		})();

		try {
			await existingDataset.datasetClient.update({ name: unname ? (null as never) : newName! });

			this.logger.stdout.success(successMessage);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				this.t(DatasetsRenameCommandMessages.renameFailed, { id, message: casted.message || String(casted) }),
			);
		}
	}
}
