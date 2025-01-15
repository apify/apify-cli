import { ApifyCommand } from '../../lib/apify_command.js';

export class RunsIndexCommand extends ApifyCommand<typeof RunsIndexCommand> {
	static override description = 'Manages Actor run operations ';

	async run() {
		await this.printHelp();
	}
}
