import process from 'node:process';

import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { error, success } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class TaskPublishCommand extends ApifyCommand<typeof TaskPublishCommand> {
	static override name = 'publish' as const;

	static override description =
		'Publishes the task on its public landing page.\n' +
		'The task must belong to a public Actor and have its public display configuration set up ' +
		'(in Apify Console, on the task Publication tab). ' +
		'Requires write access to the task and to its Actor.';

	static override examples = [
		{
			description: 'Publish a task by name.',
			command: 'apify task publish my-task',
		},
		{
			description: 'Publish a task by its full name.',
			command: 'apify task publish username/my-task',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-publish';

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name of the Task to publish, or its full name (e.g. "my-task" or "username/my-task").',
		}),
	};

	async run() {
		const apifyClient = await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();
		const usernameOrId = userInfo.username || (userInfo.id as string);

		const { taskId } = this.args;
		const idOrName = taskId.includes('/') ? taskId : `${usernameOrId}/${taskId.toLowerCase()}`;
		const taskClient = apifyClient.task(idOrName);

		const task = await taskClient.get();
		if (!task) {
			error({ message: `Cannot find Task with name '${taskId}' in your account.` });
			process.exitCode = CommandExitCodes.NotFound;
			return;
		}

		try {
			await taskClient.publish();

			success({
				message: `Task ${chalk.yellow(task.name)} has been published.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to publish Task ${chalk.yellow(task.name)}\n  ${casted.message || casted}`,
			});
			process.exitCode = CommandExitCodes.RunFailed;
		}
	}
}
