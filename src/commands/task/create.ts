import process from 'node:process';

import type { ApifyApiError, Dictionary } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { getInputOverride } from '../../lib/commands/resolve-input.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class TaskCreateCommand extends ApifyCommand<typeof TaskCreateCommand> {
	static override name = 'create' as const;

	static override description =
		'Creates a new Actor task with optional saved input and run options.\n' +
		'Provide input via --input (inline JSON) or --input-file.';

	static override examples = [
		{
			description: 'Create a task for an Actor with a name.',
			command: 'apify task create my-task --actor apify/hello-world',
		},
		{
			description: 'Create a task with saved JSON input and custom memory.',
			command:
				'apify task create my-task --actor my-username/my-actor --input \'{"url":"https://example.com"}\' --memory 2048',
		},
		{
			description: 'Create a task using input from a file.',
			command: 'apify task create my-task --actor my-actor --input-file ./input.json --title "Nightly scrape"',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-create';

	static override args = {
		taskName: Args.string({
			required: true,
			description: 'Name for the new Task (unique under your account).',
		}),
	};

	static override flags = {
		actor: Flags.string({
			description: 'Actor ID or name the task should run (e.g. "apify/hello-world" or "my-actor").',
			required: true,
		}),
		title: Flags.string({
			description: 'Optional human-readable title for the task.',
		}),
		description: Flags.string({
			description: 'Optional description for the task.',
		}),
		input: Flags.string({
			char: 'i',
			description: 'Saved task input as a JSON string.',
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			char: 'f',
			description: 'Path to a JSON file with saved task input.',
			exclusive: ['input'],
		}),
		memory: Flags.integer({
			description: 'Memory limit for the task run, in megabytes.',
		}),
		timeout: Flags.integer({
			description: 'Timeout for the task run, in seconds. Use 0 for no timeout.',
		}),
		build: Flags.string({
			description: 'Actor build tag or number to use for the task (e.g. "latest" or "1.2.3").',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { taskName } = this.args;
		const { actor: actorIdOrName, title, description, input, inputFile, memory, timeout, build, json } = this.flags;

		const client = await getLoggedClientOrThrow();
		const cwd = process.cwd();

		const actorCtx = await resolveActorContext({ providedActorNameOrId: actorIdOrName, client });
		if (!actorCtx.valid) {
			error({
				message: `${actorCtx.reason}. Please specify a valid Actor ID or name.`,
				stdout: true,
			});
			process.exitCode ||= 1;
			return;
		}

		const inputOverride = await getInputOverride(cwd, input, inputFile);
		if (inputOverride === false) {
			return;
		}

		const parsedInput = inputOverride?.input as Dictionary | undefined;

		const options =
			memory != null || timeout != null || build
				? {
						...(memory != null ? { memoryMbytes: memory } : {}),
						...(timeout != null ? { timeoutSecs: timeout } : {}),
						...(build ? { build } : {}),
					}
				: undefined;

		try {
			const newTask = await client.tasks().create({
				actId: actorCtx.id,
				name: taskName,
				...(title ? { title } : {}),
				...(description ? { description } : {}),
				...(parsedInput !== undefined ? { input: parsedInput } : {}),
				...(options ? { options } : {}),
			});

			if (json) {
				printJsonToStdout(newTask);
				return;
			}

			success({
				message: `Task with ID ${chalk.yellow(newTask.id)} (called ${chalk.yellow(newTask.name)}) was created for Actor ${chalk.yellow(actorCtx.userFriendlyId)}.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({
				message: `Failed to create Task "${taskName}".\n  ${casted.message || casted}`,
				stdout: true,
			});
			process.exitCode ||= 1;
		}
	}
}
