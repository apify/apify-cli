import { Args, Flags } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsRenameCommand extends ApifyCommand<typeof DatasetsRenameCommand> {
	static override description = 'Renames a Dataset, or removes its unique name';

	static override flags = {
		unname: Flags.boolean({
			description: 'Removes the unique name of the Dataset',
		}),
	};

	static override args = {
		nameOrId: Args.string({
			description: 'The Dataset ID or name to delete',
			required: true,
		}),
		newName: Args.string({
			description: 'The new name for the Dataset',
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
				return `The name of the Dataset with ID ${chalk.yellow(id)} has been set to: ${chalk.yellow(newName)}`;
			}

			if (unname) {
				return `The name of the Dataset with ID ${chalk.yellow(id)} has been removed (was ${chalk.yellow(name)} previously).`;
			}

			return `The name of the Dataset with ID ${chalk.yellow(id)} was changed from ${chalk.yellow(name)} to ${chalk.yellow(newName)}.`;
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
				message: `Failed to rename Dataset with ID ${chalk.yellow(id)}\n  ${casted.message || casted}`,
			});
		}
	}
}
