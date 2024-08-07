import { Args } from '@oclif/core';
import { ApifyClient, TaskStartOptions } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { SharedRunOnCloudFlags, runActorOrTaskOnCloud } from '../../lib/commands/run-on-cloud.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class TaskRunCommand extends ApifyCommand<typeof TaskRunCommand> {
	static override description =
		'Runs a specific Actor remotely on the Apify cloud platform.\n' +
		'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". ' +
		'It takes input for the Actor from the default local key-value store by default.';

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

		const waitForFinishMillis = Number.isNaN(this.flags.waitForFinish)
			? undefined
			: Number.parseInt(this.flags.waitForFinish!, 10) * 1000;

		if (this.flags.build) {
			runOpts.build = this.flags.build;
		}

		if (this.flags.timeout) {
			runOpts.timeout = this.flags.timeout;
		}

		if (this.flags.memory) {
			runOpts.memory = this.flags.memory;
		}

		await runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: taskId,
				userFriendlyId,
				title,
			},
			runOptions: runOpts,
			type: 'Task',
			waitForFinishMillis,
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
			};
		}

		throw new Error('Please provide a valid Task ID or name.');
	}
}
