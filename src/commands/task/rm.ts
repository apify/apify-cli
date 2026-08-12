import process from 'node:process';

import type { ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { resolveTaskId } from '../../lib/commands/resolve-task.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class TaskRmCommand extends ApifyCommand<typeof TaskRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes an Actor task from your account.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete a task by name (prompts for confirmation).',
			command: 'apify task rm my-task',
		},
		{
			description: 'Delete a task without prompting.',
			command: 'apify task rm my-username/my-task --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-rm';

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name or ID of the Task to delete.',
		}),
	};

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { taskId } = this.args;
		const { yes } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const resolved = await resolveTaskId(apifyClient, taskId);

		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to delete Task "${resolved.userFriendlyId}"?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmed) {
			info({
				message: `Deletion of Task "${resolved.userFriendlyId}" was canceled.`,
			});
			return;
		}

		try {
			await resolved.taskClient.delete();

			success({
				message: `Task with ID ${chalk.yellow(resolved.id)} (called ${chalk.yellow(resolved.task.name)}) was deleted.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({
				message: `Failed to delete Task "${resolved.userFriendlyId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
			process.exitCode ||= 1;
		}
	}
}
