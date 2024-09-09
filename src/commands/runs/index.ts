import { ApifyCommand } from '../../lib/apify_command.js';

export class RunsIndexCommand extends ApifyCommand<typeof RunsIndexCommand> {
	static override description = 'Commands are designed to be used with Actor Runs.';

	async run() {
		await this.printHelp();
	}
}
