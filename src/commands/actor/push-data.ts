import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { APIFY_STORAGE_TYPES, getApifyStorageClient, getDefaultStorageId } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error } from '../../lib/outputs.js';

export class ActorPushDataCommand extends ApifyCommand<typeof ActorPushDataCommand> {
	static override name = 'push-data' as const;

	static override description = "Saves data to Actor's run default dataset.";

	static override group = 'Actor Runtime';

	static override examples = [
		{
			description: 'Push a single item as an inline JSON argument.',
			command: `actor push-data '{"key":"value"}'`,
		},
		{
			description: 'Push an array of items by piping from stdin.',
			command: 'cat ./items.json | actor push-data',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#actor-push-data';

	static override args = {
		item: Args.string({
			description:
				'JSON string with one object or array of objects containing data to be stored in the default dataset.',
		}),
	};

	async run() {
		const { item: _item } = this.args;

		const item = _item || cachedStdinInput;

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
