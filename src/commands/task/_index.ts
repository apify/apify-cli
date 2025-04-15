import { TaskRunCommand } from './run.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override name = 'task' as const;

	static override description = 'Manages scheduled and predefined Actor configurations.';

	static override subcommands = [TaskRunCommand];

	async run() {
		this.printHelp();
	}
}
