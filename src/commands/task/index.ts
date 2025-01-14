import { ApifyCommand } from '../../lib/apify_command.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override description = 'Manages scheduled and predefined Actor configurations.';
	async run() {
		await this.printHelp();
	}
}
