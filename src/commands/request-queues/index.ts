import { ApifyCommand } from '../../lib/apify_command.js';

export class RequestQueuesIndexCommand extends ApifyCommand<typeof RequestQueuesIndexCommand> {
	static override description = 'Manages URL queues for web scraping and automation tasks.';

	async run() {
		await this.printHelp();
	}
}
