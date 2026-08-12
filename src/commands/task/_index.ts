import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TaskCreateCommand } from './create.js';
import { TaskInfoCommand } from './info.js';
import { TaskLsCommand } from './ls.js';
import { TaskRmCommand } from './rm.js';
import { TaskRunCommand } from './run.js';
import { TaskUpdateCommand } from './update.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override name = 'task' as const;

	static override description = 'Manage and run saved Apify tasks (named Actor configurations with input and options).';

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task';

	static override subcommands = [
		TaskCreateCommand,
		TaskInfoCommand,
		TaskLsCommand,
		TaskRmCommand,
		TaskRunCommand,
		TaskUpdateCommand,
	];

	async run() {
		this.printHelp();
	}
}
