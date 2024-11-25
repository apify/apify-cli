import { Args } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { readStdin } from '../../lib/commands/read-stdin.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class DatasetsPushDataCommand extends ApifyCommand<typeof DatasetsPushDataCommand> {
	static override description = 'Pushes an object or an array of objects to the provided Dataset.';

	static override args = {
		nameOrId: Args.string({
			required: true,
			description: 'The Dataset ID or name to push the objects to',
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
			error({
				message: `Dataset with ID or name "${nameOrId}" not found.`,
			});

			return;
		}

		const { datasetClient, dataset } = existingDataset;

		let parsedData: Record<string, unknown> | Array<Record<string, unknown>>;

		const item = _item || (await readStdin(process.stdin));

		if (!item) {
			error({ message: 'No items were provided.' });
			return;
		}

		try {
			parsedData = JSON.parse(item.toString('utf8'));
		} catch (err) {
			error({
				message: `Failed to parse data as JSON string: ${(err as Error).message}`,
			});

			return;
		}

		if (Array.isArray(parsedData) && parsedData.length === 0) {
			error({
				message: 'No items were provided.',
			});
			return;
		}

		const idMessage = dataset.name
			? `Dataset named ${chalk.yellow(dataset.name)} (${chalk.gray('ID:')} ${chalk.yellow(dataset.id)})`
			: `Dataset with ID ${chalk.yellow(dataset.id)}`;

		try {
			await datasetClient.pushItems(parsedData);

			success({
				message: `${this.pluralString(Array.isArray(parsedData) ? parsedData.length : 1, 'Object', 'Objects')} pushed to ${idMessage} successfully.`,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to push items into ${idMessage}\n  ${casted.message || casted}`,
			});
		}
	}
}
