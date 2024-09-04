import { ApifyCommand } from '../../lib/apify_command.js';

export class RequestQueuesIndexCommand extends ApifyCommand<typeof RequestQueuesIndexCommand> {
	static override description = 'Commands are designed to be used with Request Queues.';

	async run() {
		await this.printHelp();
	}
}
