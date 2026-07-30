import { readFileSync } from 'node:fs';

import type { Dictionary } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { resolveTaskId } from '../../lib/commands/resolve-task.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

function parseJsonInput(raw: string, sourceLabel: string): Dictionary | Dictionary[] {
	try {
		return JSON.parse(raw) as Dictionary | Dictionary[];
	} catch {
		throw new Error(`Failed to parse ${sourceLabel} as JSON.`);
	}
}

export class TaskUpdateCommand extends ApifyCommand<typeof TaskUpdateCommand> {
	static override name = 'update' as const;

	static override description =
		'Updates an existing Actor task (title, description, input, or run options).\n' +
		'Only the flags you pass are changed; omitted fields keep their current values.';

	static override examples = [
		{
			description: 'Rename the task title.',
			command: 'apify task update my-task --title "Updated title"',
		},
		{
			description: 'Replace saved input from a file and bump memory.',
			command: 'apify task update my-task --input-file ./input.json --memory 4096',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-task-update';

	static override args = {
		taskId: Args.string({
			required: true,
			description: 'Name or ID of the Task to update.',
		}),
	};

	static override flags = {
		name: Flags.string({
			description: 'New unique name for the task.',
		}),
		title: Flags.string({
			description: 'New human-readable title for the task.',
		}),
		description: Flags.string({
			description: 'New description for the task.',
		}),
		input: Flags.string({
			description: 'Replace saved task input with this JSON string.',
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			description: 'Replace saved task input with JSON from this file.',
			exclusive: ['input'],
		}),
		memory: Flags.integer({
			description: 'Memory limit for the task run, in megabytes.',
		}),
		timeout: Flags.integer({
			description: 'Timeout for the task run, in seconds. Use 0 for no timeout.',
		}),
		build: Flags.string({
			description: 'Actor build tag or number to use for the task.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { taskId } = this.args;
		const { name, title, description, input, inputFile, memory, timeout, build, json } = this.flags;

		const client = await getLoggedClientOrThrow();

		let resolved;
		try {
			resolved = await resolveTaskId(client, taskId);
		} catch (err) {
			error({ message: (err as Error).message, stdout: true });
			return;
		}

		let parsedInput: Dictionary | Dictionary[] | undefined;
		try {
			if (input) {
				parsedInput = parseJsonInput(input, '--input');
			} else if (inputFile) {
				parsedInput = parseJsonInput(readFileSync(inputFile, 'utf8'), `--input-file ${inputFile}`);
			}
		} catch (err) {
			error({ message: (err as Error).message, stdout: true });
			return;
		}

		const hasOptionUpdate = memory != null || timeout != null || build != null;
		const hasAnyUpdate =
			name != null || title != null || description != null || parsedInput !== undefined || hasOptionUpdate;

		if (!hasAnyUpdate) {
			error({
				message:
					'Provide at least one of --name, --title, --description, --input/--input-file, --memory, --timeout, or --build.',
				stdout: true,
			});
			return;
		}

		const nextOptions = hasOptionUpdate
			? {
					...resolved.task.options,
					...(memory != null ? { memoryMbytes: memory } : {}),
					...(timeout != null ? { timeoutSecs: timeout } : {}),
					...(build != null ? { build } : {}),
				}
			: undefined;

		const updated = await resolved.taskClient.update({
			...(name != null ? { name } : {}),
			...(title != null ? { title } : {}),
			...(description != null ? { description } : {}),
			...(parsedInput !== undefined ? { input: parsedInput } : {}),
			...(nextOptions ? { options: nextOptions } : {}),
		});

		if (json) {
			printJsonToStdout(updated);
			return;
		}

		success({
			message: `Task ${chalk.yellow(resolved.userFriendlyId)} (${chalk.gray(updated.id)}) was updated.`,
			stdout: true,
		});
	}
}
