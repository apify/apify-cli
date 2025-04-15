import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { tryToGetKeyValueStore } from '../../lib/commands/storages.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class KeyValueStoresCreateCommand extends ApifyCommand<typeof KeyValueStoresCreateCommand> {
	static override name = 'create' as const;

	static override description = 'Creates a new key-value store on your account.';

	static override args = {
		'key-value store name': Args.string({
			description: 'Optional name for the key-value store',
			required: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { keyValueStoreName } = this.args;

		const client = await getLoggedClientOrThrow();

		if (keyValueStoreName) {
			const existing = await tryToGetKeyValueStore(client, keyValueStoreName);

			if (existing) {
				error({ message: 'Cannot create a key-value store with the same name!' });
				return;
			}
		}

		const newStore = await client.keyValueStores().getOrCreate(keyValueStoreName);

		if (this.flags.json) {
			printJsonToStdout(newStore);
			return;
		}

		success({
			message: `Key-value store with ID ${chalk.yellow(newStore.id)}${keyValueStoreName ? ` (called ${chalk.yellow(keyValueStoreName)})` : ''} was created.`,
			stdout: true,
		});
	}
}
