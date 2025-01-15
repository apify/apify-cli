import { ApifyCommand } from '../../lib/apify_command.js';

export class KeyValueStoresIndexCommand extends ApifyCommand<typeof KeyValueStoresIndexCommand> {
	static override description = 'Manages persistent key-value storage.\n\nAlias: kvs';

	static override hiddenAliases = ['kvs'];

	async run() {
		await this.printHelp();
	}
}
