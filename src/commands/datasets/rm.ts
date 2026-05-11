import { DatasetsRmCommandMessages } from '#i18n/commands/datasets/rm.js';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsRmCommand extends ApifyCommand<typeof DatasetsRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes a dataset.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete a dataset by name or ID (prompts for confirmation).',
			command: 'apify datasets rm my-dataset',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets-rm';

	static override args = {
		datasetNameOrId: Args.string({
			description: 'The dataset ID or name to delete.',
			required: true,
		}),
	};

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { datasetNameOrId } = this.args;
		const { yes } = this.flags;

		const client = await getLoggedClientOrThrow();

		const existingDataset = await tryToGetDataset(client, datasetNameOrId);

		if (!existingDataset) {
			this.logger.stderr.error(this.t(DatasetsRmCommandMessages.datasetNotFound, { datasetNameOrId }));

			return;
		}

		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to delete this Dataset?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmed) {
			this.logger.stderr.info(this.t(DatasetsRmCommandMessages.deletionAborted));
			return;
		}

		const { id, name } = existingDataset.dataset;

		try {
			await existingDataset.datasetClient.delete();

			this.logger.stdout.success(
				name
					? this.t(DatasetsRmCommandMessages.deletedWithName, { id, name })
					: this.t(DatasetsRmCommandMessages.deletedUnnamed, { id }),
			);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(
				this.t(DatasetsRmCommandMessages.deleteFailed, { id, message: casted.message || String(casted) }),
			);
		}
	}
}
