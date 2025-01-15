import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override description =
		'Manages runtime data operations inside of a running Actor.\n';

	async run() {
		await this.printHelp();
	}
}
