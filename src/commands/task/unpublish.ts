import process from 'node:process';

import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { error, success } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class TaskUnpublishCommand extends ApifyCommand<typeof TaskUnpublishCommand> {
	static override name = 'unpublish' as const;

	static override description =
		'Unpublishes the task from its public landing page.\n' +
		'The public display configuration is preserved, so the task can be published again later. ' +
		'Requires write access to the task and to its Actor.';

	static override examples = [
		{
			description: 'Unpublish a task by name.',
			command: 'apify task unpublish my-task',
		},
		{
			description: 'Unpublish a task by full name.',
			command: 'apify task unpublish username/my-task',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-unpublish';

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name of the task to unpublish. For example, "my-task" or "username/my-task".',
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
			await taskClient.unpublish();

			success({
				message: `Task ${chalk.yellow(task.name)} has been unpublished.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to unpublish task ${chalk.yellow(task.name)}\n  ${casted.message || casted}`,
			});
			process.exitCode = CommandExitCodes.RunFailed;
		}
	}
}
