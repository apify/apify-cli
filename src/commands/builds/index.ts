import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override description = 'Manages Actor build processes and versioning.';

	async run() {
		await this.printHelp();
	}
}
