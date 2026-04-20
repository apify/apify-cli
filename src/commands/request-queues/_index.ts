import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class RequestQueuesIndexCommand extends ApifyCommand<typeof RequestQueuesIndexCommand> {
	static override name = 'request-queues' as const;

	static override description =
		'Manage Apify request queues. No subcommands are available yet.';

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-request-queues';

	async run() {
		this.printHelp();
	}
}
