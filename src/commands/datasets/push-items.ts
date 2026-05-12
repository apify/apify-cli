import type { ApifyApiError } from 'apify-client';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

import { DatasetsPushDataCommandMessages } from '#i18n/commands/datasets/push-items.js';

export class DatasetsPushDataCommand extends ApifyCommand<typeof DatasetsPushDataCommand> {
	static override name = 'push-items' as const;

	static override description = 'Adds data items to specified dataset. Accepts single object or array of objects.';

	static override examples = [
		{
			description: 'Push a single item as an inline JSON argument.',
			command: `apify datasets push-items my-dataset '{"url":"https://example.com"}'`,
		},
		{
			description: 'Push an array of items from stdin.',
			command: 'cat ./items.json | apify datasets push-items my-dataset',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets-push-items';

	static override args = {
		nameOrId: Args.string({
			required: true,
			description: 'The dataset ID or name to push the objects to.',
			ignoreStdin: true,
		}),
		item: Args.string({
			description: 'The object or array of objects to be pushed.',
		}),
	};

	async run() {
		const { nameOrId, item: _item } = this.args;

		const client = await getLoggedClientOrThrow();
		const existingDataset = await tryToGetDataset(client, nameOrId);

		if (!existingDataset) {
			this.logger.stderr.error(this.t(DatasetsPushDataCommandMessages.datasetNotFound, { nameOrId }));

			return;
		}

		const { datasetClient, dataset } = existingDataset;

		let parsedData: Record<string, unknown> | Record<string, unknown>[];

		const item = _item || cachedStdinInput;

		if (!item) {
			this.logger.stderr.error(this.t(DatasetsPushDataCommandMessages.noItemsProvided));
			return;
		}

		try {
			parsedData = JSON.parse(item.toString('utf8'));
		} catch (err) {
			this.logger.stderr.error(this.t(DatasetsPushDataCommandMessages.parseError, { message: (err as Error).message }));

			return;
		}

		if (Array.isArray(parsedData) && parsedData.length === 0) {
			this.logger.stderr.error(this.t(DatasetsPushDataCommandMessages.noItemsProvided));
			return;
		}

		const itemCount = Array.isArray(parsedData) ? parsedData.length : 1;
		const pluralLabel = this.pluralString(itemCount, 'Object', 'Objects');

		try {
			await datasetClient.pushItems(parsedData);

			this.logger.stderr.success(
				dataset.name
					? this.t(DatasetsPushDataCommandMessages.pushedNamed, {
							pluralLabel,
							name: dataset.name,
							id: dataset.id,
						})
					: this.t(DatasetsPushDataCommandMessages.pushedUnnamed, { pluralLabel, id: dataset.id }),
			);
		} catch (err) {
			const casted = err as ApifyApiError;
			const message = casted.message || String(casted);

			this.logger.stderr.error(
				dataset.name
					? this.t(DatasetsPushDataCommandMessages.pushFailedNamed, {
							name: dataset.name,
							id: dataset.id,
							message,
						})
					: this.t(DatasetsPushDataCommandMessages.pushFailedUnnamed, { id: dataset.id, message }),
			);
		}
	}
}
