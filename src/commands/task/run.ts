import process from 'node:process';

import type { ActorRun, ApifyClient, TaskStartOptions } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import {
	consoleDatasetUrl,
	consoleRunUrl,
	exitCodeForJobStatus,
	fetchLogTail,
	formatResultSummary,
} from '../../lib/commands/agent-output.js';
import { runActorOrTaskOnCloud, SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class TaskRunCommand extends ApifyCommand<typeof TaskRunCommand> {
	static override name = 'run' as const;

	static override description =
		'Executes predefined Actor task remotely using local key-value store for input.\n' +
		'Customize with --memory and --timeout flags.\n';

	static override examples = [
		{
			description: 'Run a task by name.',
			command: 'apify task run my-task',
		},
		{
			description: 'Run a task by full ID with custom memory and timeout.',
			command: 'apify task run username/my-task --memory 4096 --timeout 600',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-run';

	static override flags = SharedRunOnCloudFlags('Task');

	static override enableJsonFlag = true;

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

		let run: ActorRun | undefined;

		const iterator = runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: taskId,
				userFriendlyId,
				title,
			},
			runOptions: runOpts,
			type: 'Task',
			printRunLogs: true,
			waitForRunToFinish: true,
			silent: this.flags.json,
			suppressFinalStatus: true,
		});

		for await (const yieldedRun of iterator) {
			run = yieldedRun;
		}

		if (!run) {
			simpleLog({ message: 'Task run did not start.', stdout: false });
			process.exitCode = 1;
			return;
		}
		const finalRun = run;
		const finalUrl = consoleRunUrl(finalRun.actId, finalRun.id);
		const finalDatasetUrl = consoleDatasetUrl(finalRun.defaultDatasetId);
		const ok = finalRun.status === 'SUCCEEDED';
		const exitCode = exitCodeForJobStatus(finalRun.status, 'run');
		const logTail = ok ? [] : await fetchLogTail(apifyClient, finalRun.id);

		if (this.flags.json) {
			printJsonToStdout({
				ok,
				operation: 'task.run',
				task: {
					id: taskId,
					name: userFriendlyId,
					title,
				},
				actor: {
					id: finalRun.actId,
					url: `https://console.apify.com/actors/${finalRun.actId}`,
				},
				run: {
					id: finalRun.id,
					status: finalRun.status,
					exitCode: finalRun.exitCode ?? null,
					url: finalUrl,
				},
				storage: {
					defaultDatasetId: finalRun.defaultDatasetId,
					defaultKeyValueStoreId: finalRun.defaultKeyValueStoreId,
					datasetUrl: finalDatasetUrl,
				},
				...(ok
					? {}
					: {
							error: {
								phase: 'run',
								message: 'Task run did not succeed',
								logTail,
							},
						}),
				exitCode,
			});
			process.exitCode = exitCode;
			return;
		}

		simpleLog({
			message: formatResultSummary({
				resultLabel: 'Apify task run result',
				overallStatus: finalRun.status as never,
				lines: [
					{ label: 'Run', value: finalRun.status as string },
					{ label: 'Task ID', value: taskId },
					{ label: 'Actor ID', value: finalRun.actId },
					{ label: 'Run ID', value: finalRun.id },
					{ label: 'Build number', value: finalRun.buildNumber },
					...(typeof finalRun.exitCode === 'number' ? [{ label: 'Exit code', value: String(finalRun.exitCode) }] : []),
					{ label: 'Dataset ID', value: finalRun.defaultDatasetId },
					{ label: 'Key-value store ID', value: finalRun.defaultKeyValueStoreId },
				],
				links: [
					{ label: 'Run URL', url: finalUrl },
					{ label: 'Dataset URL', url: finalDatasetUrl },
				],
				errorReason: ok ? undefined : logTail,
			}),
			stdout: true,
		});

		process.exitCode = exitCode;
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
