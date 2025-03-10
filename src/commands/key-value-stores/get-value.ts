import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresGetValueCommand extends ApifyCommand<typeof KeyValueStoresGetValueCommand> {
	static override name = 'get-value';

	static override description =
		'Retrieves stored value for specified key. Use --only-content-type to check MIME type.';

	static override flags = {
		'only-content-type': Flags.boolean({
			description: 'Only return the content type of the specified key',
			default: false,
		}),
	};

	static override args = {
		keyValueStoreId: Args.string({
			description: 'The key-value store ID to get the value from.',
			required: true,
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
		}),
	};

	async run() {
		const { onlyContentType } = this.flags;
		const { keyValueStoreId, itemKey } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetKeyValueStore(apifyClient, keyValueStoreId);

		if (!maybeStore) {
			error({ message: `Key-value store with ID "${keyValueStoreId}" not found.` });
			return;
		}

		const { keyValueStoreClient: storeClient } = maybeStore;

		const itemRecord = await storeClient.getRecord(itemKey, { stream: true });

		if (!itemRecord) {
			error({ message: `Item with key "${itemKey}" not found in the key-value store.` });
			return;
		}

		// Print out the content-type on stderr (default to octet-stream for unknown content types)
		simpleLog({ message: itemRecord.contentType ?? 'application/octet-stream' });

		if (onlyContentType) {
			// Close the stream as otherwise the process hangs
			itemRecord.value.destroy();
			return;
		}

		// Try to pretty-print JSON
		if (itemRecord.contentType?.includes('application/json')) {
			const { value: stream } = itemRecord;

			const chunks: Buffer[] = [];

			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			const concatenated = Buffer.concat(chunks).toString();

			try {
				const parsed = JSON.parse(concatenated);
				simpleLog({ message: JSON.stringify(parsed, null, 2), stdout: true });
			} catch {
				// Print out as is directly to stdout
				simpleLog({ message: concatenated, stdout: true });
			}

			return;
		}

		// pipe the output to stdout
		itemRecord.value.pipe(process.stdout);
	}
}
