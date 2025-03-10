import type { ApifyClient, TaskStartOptions } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { runActorOrTaskOnCloud, SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class TaskRunCommand extends ApifyCommand<typeof TaskRunCommand> {
	static override name = 'run';

	static override description =
		'Executes predefined Actor task remotely using local key-value store for input.\n' +
		'Customize with --memory and --timeout flags.\n';

	static override flags = SharedRunOnCloudFlags('Task');

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name or ID of the Task to run (e.g. "my-task" or "E2jjCZBezvAZnX8Rb").',
		}),
	};

	async run() {
		const apifyClient = await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();
		const usernameOrId = userInfo.username || (userInfo.id as string);

		const { id: taskId, userFriendlyId, title } = await this.resolveTaskId(apifyClient, usernameOrId);

		const runOpts: TaskStartOptions = {
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		};

		if (this.flags.build) {
			runOpts.build = this.flags.build;
		}

		if (this.flags.timeout) {
			runOpts.timeout = this.flags.timeout;
		}

		if (this.flags.memory) {
			runOpts.memory = this.flags.memory;
		}

		let url: string;
		let datasetUrl: string;

		const iterator = runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: taskId,
				userFriendlyId,
				title,
			},
			runOptions: runOpts,
			type: 'Task',
			printRunLogs: true,
		});

		for await (const yieldedRun of iterator) {
			url = `https://console.apify.com/actors/${yieldedRun.actId}/runs/${yieldedRun.id}`;
			datasetUrl = `https://console.apify.com/storage/datasets/${yieldedRun.defaultDatasetId}`;
		}

		simpleLog({
			message: [
				'',
				`${chalk.blue('Export results')}: ${datasetUrl!}`,
				`${chalk.blue('View on Apify Console')}: ${url!}`,
			].join('\n'),
			stdout: true,
		});
	}

	private async resolveTaskId(client: ApifyClient, usernameOrId: string) {
		const { taskId } = this.args;

		// Full ID
		if (taskId?.includes('/')) {
			const task = await client.task(taskId).get();
			if (!task) {
				throw new Error(`Cannot find Task with ID '${taskId}' in your account.`);
			}

			return {
				id: task.id,
				userFriendlyId: `${usernameOrId}/${task.name}`,
				title: task.title,
				task,
			};
		}

		// Try fetching task directly by name
		if (taskId) {
			const task = await client.task(`${usernameOrId}/${taskId.toLowerCase()}`).get();

			if (!task) {
				throw new Error(`Cannot find Task with name '${taskId}' in your account.`);
			}

			return {
				id: task.id,
				userFriendlyId: `${usernameOrId}/${task.name}`,
				title: task.title,
				task,
			};
		}

		throw new Error('Please provide a valid Task ID or name.');
	}
}
