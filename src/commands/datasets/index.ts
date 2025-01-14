import { ApifyCommand } from '../../lib/apify_command.js';

export class DatasetsIndexCommand extends ApifyCommand<typeof DatasetsIndexCommand> {
	static override description = 'Manages structured data storage and retrieval.';

	async run() {
		await this.printHelp();
	}
}
