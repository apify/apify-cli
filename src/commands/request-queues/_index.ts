import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class RequestQueuesIndexCommand extends ApifyCommand<typeof RequestQueuesIndexCommand> {
	static override name = 'request-queues' as const;

	static override description = 'Manages URL queues for web scraping and automation tasks.';

	async run() {
		this.printHelp();
	}
}
