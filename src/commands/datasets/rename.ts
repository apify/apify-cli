import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsRenameCommand extends ApifyCommand<typeof DatasetsRenameCommand> {
	static override name = 'rename';

	static override description = 'Change dataset name or removes name with --unname flag.';

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
		const existingDataset = await tryToGetDataset(client, nameOrId);

		if (!existingDataset) {
			error({
				message: `Dataset with ID or name "${nameOrId}" not found.`,
			});

			return;
		}

		const { id, name } = existingDataset.dataset;

		const successMessage = (() => {
			if (!name) {
				return `The name of the dataset with ID ${chalk.yellow(id)} has been set to: ${chalk.yellow(newName)}`;
			}

			if (unname) {
				return `The name of the dataset with ID ${chalk.yellow(id)} has been removed (was ${chalk.yellow(name)} previously).`;
			}

			return `The name of the dataset with ID ${chalk.yellow(id)} was changed from ${chalk.yellow(name)} to ${chalk.yellow(newName)}.`;
		})();

		try {
			await existingDataset.datasetClient.update({ name: unname ? (null as never) : newName! });

			success({
				message: successMessage,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to rename dataset with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
