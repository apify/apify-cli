import { join, resolve } from 'node:path';
import process from 'node:process';

import { calculateRunDynamicMemory } from '@apify/actor-memory-expression';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, info, success } from '../../lib/outputs.js';
import { getJsonFileContent, getLocalKeyValueStorePath } from '../../lib/utils.js';

const DEFAULT_INPUT_PATH = join(getLocalKeyValueStorePath('default'), 'INPUT.json');

/**
 * This command can be used to test dynamic memory calculation expressions
 * defined in actor.json or provided via command-line flags.
 *
 * Dynamic memory allows Actors to adjust their memory usage based on input data
 * and run options, optimizing resource allocation and costs.
 */
export class ActorCalculateMemoryCommand extends ApifyCommand<typeof ActorCalculateMemoryCommand> {
	static override name = 'calculate-memory' as const;

	static override description =
		`Calculates the Actor’s dynamic memory usage based on a memory expression from actor.json, input data, and run options.`;

	/**
	 * Additional run options exist (e.g., memoryMbytes, disksMbytes, etc.),
	 * but we intentionally omit them here. These options are rarely needed and
	 * exposing them would introduce unnecessary confusion for users.
	 */
	static override flags = {
		input: Flags.string({
			description: 'Path to the input JSON file used for the calculation.',
			required: false,
			default: DEFAULT_INPUT_PATH,
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
	};

	async run() {
		const { input, defaultMemoryMbytes, ...runOptions } = this.flags;

		let memoryExpression: string | undefined = defaultMemoryMbytes;

		// If not provided via flag, try to load from actor.json
		if (!memoryExpression) {
			memoryExpression = await this.getExpressionFromConfig();
		}

		if (!memoryExpression) {
			throw new Error(
				`No memory-calculation expression found. Provide it via the --defaultMemoryMbytes flag or define defaultMemoryMbytes in actor.json.`,
			);
		}

		// Let's not check for input existence here, as the expression might not use it at all.
		const inputPath = resolve(process.cwd(), this.flags.input);
		const inputJson = getJsonFileContent(inputPath) ?? {};

		info({ message: `Evaluating memory expression: ${memoryExpression}` });

		try {
			const result = await calculateRunDynamicMemory(memoryExpression, {
				input: inputJson,
				runOptions,
			});
			success({ message: `Calculated memory: ${result} MB`, stdout: true });
		} catch (err) {
			error({ message: `Memory calculation failed: ${(err as Error).message}` });
		}
	}

	/**
	 * Helper to load the `defaultMemoryMbytes` expression from actor.json.
	 */
	private async getExpressionFromConfig(): Promise<string | undefined> {
		const cwd = process.cwd();
		const localConfigResult = await useActorConfig({ cwd });

		if (localConfigResult.isErr()) {
			const { message, cause } = localConfigResult.unwrapErr();

			error({ message: `${message}${cause ? `\n  ${cause.message}` : ''}` });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config: localConfig } = localConfigResult.unwrap();
		return localConfig?.defaultMemoryMbytes?.toString();
	}
}
