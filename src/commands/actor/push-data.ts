import { Args } from '@oclif/core';

import { APIFY_STORAGE_TYPES, getApifyStorageClient, getDefaultStorageId } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';
import { readStdin } from '../../lib/commands/read-stdin.js';
import { error } from '../../lib/outputs.js';

export class PushDataCommand extends ApifyCommand<typeof PushDataCommand> {
	static override description =
		"Saves data to Actor's run default dataset.\n\n" +
		'Accept input as:\n' +
		'  - JSON argument:\n' +
		'  $ apify actor push-data {"key": "value"}\n' +
		'  - Piped stdin:\n' +
		'  $ cat ./test.json | apify actor push-data';

	static override args = {
		item: Args.string({
			description:
				'JSON string with one object or array of objects containing data to be stored in the default dataset.',
		}),
	};

	async run() {
		const { item: _item } = this.args;

		const item = _item || (await readStdin(process.stdin));

		if (!item) {
			error({ message: 'No item was provided.' });
			return;
		}

		const apifyClient = await getApifyStorageClient();
		const defaultStoreId = getDefaultStorageId(APIFY_STORAGE_TYPES.DATASET);

		let parsedData: Record<string, unknown> | Record<string, unknown>[];
		try {
			parsedData = JSON.parse(item.toString('utf8'));
		} catch (err) {
			throw new Error(`Failed to parse data as JSON string: ${(err as Error).message}`);
		}

		await apifyClient.dataset(defaultStoreId).pushItems(parsedData);
	}
}
