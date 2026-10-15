import type { ApifyApiError } from 'apify-client';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class KeyValueStoresSetValueCommand extends ApifyCommand<typeof KeyValueStoresSetValueCommand> {
	static override name = 'set-value' as const;

	static override enableProfileFlag = true;

	static override description = 'Stores value with specified key. Set content-type with --content-type flag.';

	static override examples = [
		{
			description: 'Store a JSON value under a key.',
			command: `apify key-value-stores set-value <storeId> OUTPUT '{"status":"done"}'`,
		},
		{
			description: 'Store a plain-text file read from stdin.',
			command: 'cat ./report.txt | apify key-value-stores set-value <storeId> REPORT --content-type text/plain',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-key-value-stores-set-value';

	static override flags = {
		'content-type': Flags.string({
			description: 'The MIME content type of the value. By default, "application/json" is assumed.',
			default: 'application/json',
		}),
	};

	static override args = {
		storeId: Args.string({
			description: 'The key-value store ID to set the value in.',
			required: true,
		}),
		itemKey: Args.string({
			description: 'The key of the item in the key-value store.',
			required: true,
		}),
		value: Args.string({
			description: 'The value to set.',
		}),
	};

	async run() {
		const { storeId, itemKey, value } = this.args;
		const { contentType } = this.flags;

		// NOTE: If the value is passed as an argument and on stdin at the same time, the argument wins.
		// Stdin was already read at startup (see `cachedStdinInput`), so the raw `process.stdin` stream is drained.
		const recordValue = value || cachedStdinInput;

		if (!recordValue) {
			error({ message: 'No value was provided. Pass it as an argument or pipe it into the command.' });
			process.exitCode = 1;

			return;
		}

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetKeyValueStore(apifyClient, storeId);

		if (!maybeStore) {
			error({
				message: `Key-value store with ID or name "${storeId}" not found.`,
			});

			return;
		}

		const { keyValueStoreClient: client } = maybeStore;

		try {
			// TODO: again, the types need to be fixed -w-
			await client.setRecord({ key: itemKey, value: recordValue as string, contentType });

			success({
				message: `Value with key "${itemKey}" set in the key-value store.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to set value with key "${itemKey}" in the key-value store.\n  ${casted.message || casted}`,
			});
		}
	}
}
