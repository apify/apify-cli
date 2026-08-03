import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TaskPublishCommand } from './publish.js';
import { TaskRunCommand } from './run.js';
import { TaskUnpublishCommand } from './unpublish.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
	static override name = 'task' as const;

	static override description = `Run and publish saved Apify tasks (named Actor configurations). Create and manage tasks in Apify Console.`;

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task';

	static override subcommands = [TaskRunCommand, TaskPublishCommand, TaskUnpublishCommand];

	async run() {
		this.printHelp();
	}
}
