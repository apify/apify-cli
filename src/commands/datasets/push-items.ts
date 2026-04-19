import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsPushDataCommand extends ApifyCommand<typeof DatasetsPushDataCommand> {
	static override name = 'push-items' as const;

	static override description = 'Adds data items to specified dataset. Accepts single object or array of objects.';

	static override args = {
		nameOrId: Args.string({
			required: true,
			description: 'The dataset ID or name to push the objects to',
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
			this.logger.stderr.error(`Dataset with ID or name "${nameOrId}" not found.`);

			return;
		}

		const { datasetClient, dataset } = existingDataset;

		let parsedData: Record<string, unknown> | Record<string, unknown>[];

		const item = _item || cachedStdinInput;

		if (!item) {
			this.logger.stderr.error('No items were provided.');
			return;
		}

		try {
			parsedData = JSON.parse(item.toString('utf8'));
		} catch (err) {
			this.logger.stderr.error(`Failed to parse data as JSON string: ${(err as Error).message}`);

			return;
		}

		if (Array.isArray(parsedData) && parsedData.length === 0) {
			this.logger.stderr.error('No items were provided.');
			return;
		}

		const idMessage = dataset.name
			? `Dataset named ${chalk.yellow(dataset.name)} (${chalk.gray('ID:')} ${chalk.yellow(dataset.id)})`
			: `Dataset with ID ${chalk.yellow(dataset.id)}`;

		try {
			await datasetClient.pushItems(parsedData);

			this.logger.stderr.success(
				`${this.pluralString(Array.isArray(parsedData) ? parsedData.length : 1, 'Object', 'Objects')} pushed to ${idMessage} successfully.`,
			);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stderr.error(`Failed to push items into ${idMessage}\n  ${casted.message || casted}`);
		}
	}
}
