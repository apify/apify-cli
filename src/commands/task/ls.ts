import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow, printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Task ID', 'Name', 'Actor ID', 'Runs', 'Created', 'Modified'],
	mandatoryColumns: ['Task ID', 'Name', 'Runs'],
	columnAlignments: {
		Runs: 'right',
	},
});

export class TaskLsCommand extends ApifyCommand<typeof TaskLsCommand> {
	static override name = 'ls' as const;

	static override description = 'Lists Actor tasks on your account.';

	static override examples = [
		{
			description: 'List your tasks (most recently modified first).',
			command: 'apify task ls --desc',
		},
		{
			description: 'List the next page of 50 tasks.',
			command: 'apify task ls --limit 50 --offset 50',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-ls';

	static override flags = {
		offset: Flags.integer({
			description: 'Number of tasks that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of tasks that will be listed.',
			default: 20,
		}),
		desc: Flags.boolean({
			description: 'Sort tasks in descending order.',
			default: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { desc, offset, limit, json } = this.flags;

		const client = await getLoggedClientOrThrow();
		const user = await getLocalUserInfo();

		const rawTaskList = await client.tasks().list({ desc, offset, limit });

		if (json) {
			printJsonToStdout(rawTaskList);
			return;
		}

		if (rawTaskList.count === 0) {
			info({
				message: "You don't have any Tasks on your account",
				stdout: true,
			});

			return;
		}

		for (const task of rawTaskList.items) {
			table.pushRow({
				'Task ID': task.id,
				Name: task.name ? `${user.username ?? task.username}/${task.name}` : chalk.italic('Unnamed'),
				'Actor ID': chalk.gray(task.actId),
				Runs: chalk.cyan(`${task.stats?.totalRuns ?? 0}`),
				Created: TimestampFormatter.display(task.createdAt),
				Modified: TimestampFormatter.display(task.modifiedAt),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}
}
