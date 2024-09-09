import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override description = 'Commands are designed to be used with Actor Builds.';

	async run() {
		await this.printHelp();
	}
}
