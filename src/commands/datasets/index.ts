import { ApifyCommand } from '../../lib/apify_command.js';

export class DatasetsIndexCommand extends ApifyCommand<typeof DatasetsIndexCommand> {
	static override description = 'Commands are designed to be used with Datasets.';

	async run() {
		await this.printHelp();
	}
}
