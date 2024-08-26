import { Args } from '@oclif/core';

import { APIFY_STORAGE_TYPES, getApifyStorageClient, getDefaultStorageId } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';

export class PushDataCommand extends ApifyCommand<typeof PushDataCommand> {
	static override description =
		'Stores an object or an array of objects to the default dataset of the Actor run.\n' +
		'It is possible to pass data using item argument or stdin.\n' +
		'Passing data using argument:\n' +
		'$ apify actor push-data {"foo": "bar"}\n' +
		'Passing data using stdin with pipe:\n' +
		'$ cat ./test.json | apify actor push-data\n';

	static override args = {
		item: Args.string({
			required: false,
			description:
				'JSON string with one object or array of objects containing data to be stored in the default dataset.',
		}),
	};

	async run() {
		const { item } = this.args;

		const apifyClient = await getApifyStorageClient();
		const defaultStoreId = getDefaultStorageId(APIFY_STORAGE_TYPES.DATASET);

		let parsedData: Record<string, unknown> | Record<string, unknown>[];
		try {
			parsedData = JSON.parse(item!);
		} catch (err) {
			throw new Error(`Failed to parse data as JSON string: ${(err as Error).message}`);
		}

		await apifyClient.dataset(defaultStoreId).pushItems(parsedData);
	}
}
