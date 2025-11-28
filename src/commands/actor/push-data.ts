import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { APIFY_STORAGE_TYPES, getApifyStorageClient, getDefaultStorageId } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error } from '../../lib/outputs.js';

export class ActorPushDataCommand extends ApifyCommand<typeof ActorPushDataCommand> {
	static override name = 'push-data' as const;

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

	static override requiresAuthentication = 'optionally' as const;

	async run() {
		const { item: _item } = this.args;

		const item = _item || cachedStdinInput;

		if (!item) {
			error({ message: 'No item was provided.' });
			return;
		}

		const apifyClient = await getApifyStorageClient(this.apifyClient);
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
