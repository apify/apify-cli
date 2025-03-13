import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';
import { confirmAction } from '../../lib/utils/confirm.js';

export class DatasetsRmCommand extends ApifyCommand<typeof DatasetsRmCommand> {
	static override name = 'rm';

	static override description = 'Permanently removes a dataset.';

	static override args = {
		datasetNameOrId: Args.string({
			description: 'The dataset ID or name to delete',
			required: true,
		}),
	};

	async run() {
		const { datasetNameOrId } = this.args;

		const client = await getLoggedClientOrThrow();

		const existingDataset = await tryToGetDataset(client, datasetNameOrId);

		if (!existingDataset) {
			error({
				message: `Dataset with ID or name "${datasetNameOrId}" not found.`,
			});

			return;
		}

		const confirmed = await confirmAction({ type: 'Dataset' });

		if (!confirmed) {
			info({ message: 'Dataset deletion has been aborted.' });
			return;
		}

		const { id, name } = existingDataset.dataset;

		try {
			await existingDataset.datasetClient.delete();

			success({
				message: `Dataset with ID ${chalk.yellow(id)}${name ? ` (called ${chalk.yellow(name)})` : ''} has been deleted.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to delete dataset with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
