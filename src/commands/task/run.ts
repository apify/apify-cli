import type { ActorRun, TaskStartOptions } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { resolveTaskId } from '../../lib/commands/resolve-task.js';
import { runActorOrTaskOnCloud, SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';
import { finalizeRun } from '../../lib/commands/run-result.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

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
		const { id: taskId, userFriendlyId, title } = await resolveTaskId(apifyClient, this.args.taskId);

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

		let run!: ActorRun;

		const iterator = runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: taskId,
				userFriendlyId,
				title,
			},
			runOptions: runOpts,
			type: 'Task',
			waitForRunToFinish: true,
			printRunLogs: true,
			suppressFinalStatus: true,
		});

		for await (const yieldedRun of iterator) {
			run = yieldedRun;
		}

		await finalizeRun({ apifyClient, run, operation: 'task-run', json: this.flags.json });
	}
}
