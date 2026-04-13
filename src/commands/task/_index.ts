import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TaskRunCommand } from './run.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override name = 'task' as const;

	static override description =
		`Run saved Apify tasks (named Actor configurations). Currently supports 'task run' only; create and manage tasks in the Apify Console.`;

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task';

	static override subcommands = [TaskRunCommand];

	async run() {
		this.printHelp();
	}
}
