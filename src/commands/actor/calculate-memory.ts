import { join } from 'node:path';
import process from 'node:process';

import { calculateRunDynamicMemory } from '@apify/actor-memory-expression';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, info, success } from '../../lib/outputs.js';
import { getJsonFileContent } from '../../lib/utils.js';

export class ActorCalculateMemoryCommand extends ApifyCommand<typeof ActorCalculateMemoryCommand> {
	static override name = 'calculate-memory' as const;

	private readonly DEFAULT_INPUT_PATH = 'storage/key_value_stores/default/INPUT.json';

	static override description =
		`Calculates the actor’s dynamic memory usage based on a memory expression from actor.json, input data, and run options.`;

	static override flags = {
		input: Flags.string({
			description: 'Path to the input JSON file used for the calculation.',
			required: false,
			default: 'storage/key_value_stores/default/INPUT.json',
		}),
		defaultMemoryMbytes: Flags.string({
			description:
				'Memory-calculation expression (in MB). If omitted, the value is loaded from the actor.json file.',
			required: false,
		}),
		build: Flags.string({
			description: 'Actor build version or build tag to evaluate the expression with.',
			required: false,
		}),
		timeoutSecs: Flags.integer({
			description: 'Maximum run timeout, in seconds.',
			required: false,
		}),
		maxItems: Flags.integer({
			description: 'Maximum number of items Actor can output.',
			required: false,
		}),
		maxTotalChargeUsd: Flags.integer({
			description: 'Maximum total charge in USD.',
			required: false,
		}),
		restartOnError: Flags.boolean({
			description: 'Whether to restart the actor on error.',
			required: false,
		}),
	};

	async run() {
		const { input, defaultMemoryMbytes, ...runOptions } = this.flags;

		const cwd = process.cwd();

		let preparedDefaultMemoryMbytes: string | undefined = defaultMemoryMbytes;
		if (!preparedDefaultMemoryMbytes) {
			const localConfigResult = await useActorConfig({ cwd });

			if (localConfigResult.isErr()) {
				const { message, cause } = localConfigResult.unwrapErr();

				error({ message: `${message}${cause ? `\n  ${cause.message}` : ''}` });
				process.exitCode = CommandExitCodes.InvalidActorJson;
				return;
			}

			if (localConfigResult.isOkAnd((cfg) => cfg.exists === false)) {
				throw new Error(
					`actor.json not found at: ${join(cwd, 'actor.json')}. Make sure the file exists and is readable.`,
				);
			}

			const { config: localConfig } = localConfigResult.unwrap();
			preparedDefaultMemoryMbytes = localConfig.defaultMemoryMbytes as string | undefined;
		}

		if (!preparedDefaultMemoryMbytes) {
			throw new Error(
				`No memory-calculation expression found. Provide it via the --defaultMemoryMbytes flag or define defaultMemoryMbytes in actor.json.`,
			);
		}

		// Let's not check for input existence here, as the expression might not use it at all.
		const inputPath = join(process.cwd(), this.flags.input ?? this.DEFAULT_INPUT_PATH);
		const inputJson = getJsonFileContent(inputPath) ?? {};

		info({ message: `Evaluating memory expression: ${preparedDefaultMemoryMbytes}` });

		try {
			const result = await calculateRunDynamicMemory(preparedDefaultMemoryMbytes, {
				input: inputJson,
				runOptions,
			});
			success({ message: `Calculated memory: ${result} MB` });
		} catch (err) {
			error({ message: `Memory calculation failed: ${(err as Error).message}` });
		}
	}
}
