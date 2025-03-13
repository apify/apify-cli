import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class DatasetsCreateCommand extends ApifyCommand<typeof DatasetsCreateCommand> {
	static override name = 'create';

	static override description = 'Creates a new dataset for storing structured data on your account.';

	static override args = {
		datasetName: Args.string({
			description: 'Optional name for the Dataset',
			required: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { datasetName } = this.args;

		const client = await getLoggedClientOrThrow();

		if (datasetName) {
			const existing = await tryToGetDataset(client, datasetName);

			if (existing) {
				error({ message: 'A Dataset with this name already exists!' });
				return;
			}
		}

		const newDataset = await client.datasets().getOrCreate(datasetName);

		if (this.flags.json) {
			printJsonToStdout(newDataset);
			return;
		}

		success({
			message: `Dataset with ID ${chalk.yellow(newDataset.id)}${datasetName ? ` (called ${chalk.yellow(datasetName)})` : ''} was created.`,
			stdout: true,
		});
	}
}
