import { DatasetsCreateCommandMessages } from '#i18n/commands/datasets/create.js';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsCreateCommand extends ApifyCommand<typeof DatasetsCreateCommand> {
	static override name = 'create' as const;

	static override description = 'Creates a new dataset for storing structured data on your account.';

	static override examples = [
		{
			description: 'Create an unnamed dataset.',
			command: 'apify datasets create',
		},
		{
			description: 'Create a named dataset.',
			command: 'apify datasets create my-dataset',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets-create';

	static override args = {
		datasetName: Args.string({
			description: 'Optional name for the Dataset.',
			required: false,
		}),
	};

	async run() {
		const { datasetName } = this.args;

		const client = await getLoggedClientOrThrow();

		if (datasetName) {
			const existing = await tryToGetDataset(client, datasetName);

			if (existing) {
				this.logger.stderr.error(this.t(DatasetsCreateCommandMessages.alreadyExists));
				return;
			}
		}

		const newDataset = await client.datasets().getOrCreate(datasetName);

		if (this.flags.json) {
			this.logger.stdout.json(newDataset);
			return;
		}

		this.logger.stdout.success(
			datasetName
				? this.t(DatasetsCreateCommandMessages.createdWithName, { id: newDataset.id, name: datasetName })
				: this.t(DatasetsCreateCommandMessages.created, { id: newDataset.id }),
		);
	}
}
