import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override description =
		'Manages data operations during Actor execution\nNote: Commands are in preview state. Do not use in production environment.\n';

	async run() {
		await this.printHelp();
	}
}
