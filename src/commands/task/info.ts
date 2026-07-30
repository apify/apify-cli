import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { resolveTaskId } from '../../lib/commands/resolve-task.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const consoleLikeTable = new ResponsiveTable({
	allColumns: ['Row1', 'Row2'],
	mandatoryColumns: ['Row1', 'Row2'],
});

export class TaskInfoCommand extends ApifyCommand<typeof TaskInfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints information about a specific Actor task.';

	static override examples = [
		{
			description: 'Show task metadata and run options.',
			command: 'apify task info my-task',
		},
		{
			description: 'Show task details as JSON, including saved input.',
			command: 'apify task info my-username/my-task --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-info';

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name or ID of the Task (e.g. "my-task" or "username/my-task").',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { taskId } = this.args;
		const apifyClient = await getLoggedClientOrThrow();

		let resolved;
		try {
			resolved = await resolveTaskId(apifyClient, taskId);
		} catch (err) {
			error({ message: (err as Error).message, stdout: true });
			return;
		}

		const { task, userFriendlyId } = resolved;

		const [user, actor, input] = await Promise.all([
			apifyClient
				.user(task.userId)
				.get()
				.then((u) => u!),
			apifyClient.actor(task.actId).get(),
			apifyClient
				.task(task.id)
				.getInput()
				.catch(() => undefined),
		]);

		if (this.flags.json) {
			printJsonToStdout({
				...task,
				input: input ?? task.input ?? null,
				user,
				actor: actor || null,
			});
			return;
		}

		const memory = task.options?.memoryMbytes;
		const timeout = task.options?.timeoutSecs;
		const build = task.options?.build;

		const optionsParts = [
			memory != null ? `${chalk.bold(memory)} ${chalk.gray('MB')}` : chalk.gray('default memory'),
			timeout != null
				? `${chalk.bold(timeout)} ${chalk.gray(this.pluralString(timeout, 'second', 'seconds'))}`
				: chalk.gray('default timeout'),
			build ? `${chalk.gray('build')} ${chalk.bold(build)}` : chalk.gray('default build'),
		];

		const row1 = [
			`Task ID: ${chalk.bgGray(task.id)}`,
			`Name: ${chalk.bgGray(task.name)}`,
			`Title: ${task.title ? chalk.bold(task.title) : chalk.italic(chalk.gray('None'))}`,
			`Created: ${chalk.bold(TimestampFormatter.display(task.createdAt))}`,
			`Modified: ${chalk.bold(TimestampFormatter.display(task.modifiedAt))}`,
		].join('\n');

		const row2 = [
			`Actor: ${actor ? chalk.blue(actor.title || `${actor.username}/${actor.name}`) : chalk.gray(task.actId)}`,
			`Total runs: ${chalk.cyan(task.stats?.totalRuns ?? 0)}`,
			`Options: ${optionsParts.join(' / ')}`,
		].join('\n');

		consoleLikeTable.pushRow({
			Row1: row1,
			Row2: row2,
		});

		const rendered = consoleLikeTable.render(CompactMode.NoLines);
		const rows = rendered.split('\n').map((row) => row.trim());
		rows.shift();

		const description = task.description?.trim() ? ['', chalk.bold('Description'), task.description.trim()] : [];

		const message = [
			`${chalk.bold(task.title || task.name)}`,
			`${chalk.gray(userFriendlyId)}  ${chalk.gray('Owned by')} ${chalk.blue(user.username)}`,
			'',
			rows.join('\n'),
			...description,
		].join('\n');

		simpleLog({ message, stdout: true });
	}
}
