import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override description = 'Manages Actor creation, deployment, and execution on the Apify platform.';

	async run() {
		await this.printHelp();
	}
}
