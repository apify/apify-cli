import { ApifyCommand } from '../../lib/apify_command.js';

export class KeyValueStoresIndexCommand extends ApifyCommand<typeof KeyValueStoresIndexCommand> {
	static override description = 'Commands are designed to be used with Key Value Stores.';

	async run() {
		await this.printHelp();
	}
}
