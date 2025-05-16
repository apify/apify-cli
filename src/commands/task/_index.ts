import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TaskRunCommand } from './run.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override name = 'task' as const;

	static override description = 'Manages scheduled and predefined Actor configurations.';

	static override subcommands = [TaskRunCommand];

	async run() {
		this.printHelp();
	}
}
