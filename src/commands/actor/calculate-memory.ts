import { join, resolve } from 'node:path';
import process from 'node:process';

import { calculateRunDynamicMemory } from '@apify/actor-memory-expression';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { getJsonFileContent, getLocalKeyValueStorePath } from '../../lib/utils.js';

import { ActorCalculateMemoryCommandMessages } from '#i18n/commands/actor/calculate-memory.js';

const DEFAULT_INPUT_PATH = join(getLocalKeyValueStorePath('default'), 'INPUT.json');

interface ActorMemoryConfig {
	defaultMemoryMbytes?: string;
	minMemoryMbytes?: number;
	maxMemoryMbytes?: number;
}

/**
 * This command can be used to test dynamic memory calculation expressions
 * defined in actor.json or provided via command-line flag.
 *
 * Dynamic memory allows Actors to adjust their memory usage based on input data
 * and run options, optimizing resource allocation and costs.
 */
export class ActorCalculateMemoryCommand extends ApifyCommand<typeof ActorCalculateMemoryCommand> {
	static override name = 'calculate-memory' as const;

	static override description = `Calculates the Actor’s dynamic memory usage based on a memory expression from actor.json, input data, and run options.`;

	static override group = 'Actor Runtime';

	static override examples = [
		{
			description: 'Calculate memory using the expression and input defaults from actor.json.',
			command: 'actor calculate-memory',
		},
		{
			description: 'Override the memory expression and input file.',
			command: 'actor calculate-memory --defaultMemoryMbytes "input.length * 128" --input ./my-input.json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#actor-calculate-memory';

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
			description: 'Memory-calculation expression (in MB). If omitted, the value is loaded from the actor.json file.',
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
		const { input, memoryExpression, minMemory, maxMemory, runOptions } = await this.prepareMemoryArguments();

		if (!memoryExpression) {
			throw new Error(this.t(ActorCalculateMemoryCommandMessages.missingMemoryExpression));
		}

		const inputPath = resolve(process.cwd(), input);
		const inputJson = getJsonFileContent(inputPath) ?? {};

		this.logger.stderr.info(this.t(ActorCalculateMemoryCommandMessages.evaluatingExpression, { memoryExpression }));

		try {
			const result = await calculateRunDynamicMemory(memoryExpression, {
				input: inputJson,
				runOptions,
			});
			const clampedResult = Math.min(Math.max(result, minMemory), maxMemory);

			this.logger.stdout.success(
				this.t(ActorCalculateMemoryCommandMessages.calculatedMemory, {
					result: String(clampedResult),
					jsonParams: [
						{
							expression: memoryExpression,
							resultMb: clampedResult,
						},
					],
				}),
			);
		} catch (err) {
			const { message } = err as Error;

			this.logger.stderr.error(
				this.t(ActorCalculateMemoryCommandMessages.calculationFailed, { message, jsonParams: [message] }),
			);
		}
	}

	/**
	 * Determines the memory arguments to use.
	 * If --defaultMemoryMbytes flag is set, use it (unlimited min/max).
	 * Otherwise, load from actor.json.
	 */
	private async prepareMemoryArguments() {
		const { input, defaultMemoryMbytes, ...runOptions } = this.flags;

		let memoryExpression: string | undefined = defaultMemoryMbytes;
		let minMemory = 0;
		let maxMemory = Infinity;

		// If not provided via flag, try to load from actor.json
		if (!memoryExpression) {
			({
				defaultMemoryMbytes: memoryExpression,
				minMemoryMbytes: minMemory = minMemory, // Fallback to minMemory(0) if undefined
				maxMemoryMbytes: maxMemory = maxMemory, // Fallback to maxMemory(Infinity) if undefined
			} = await this.getExpressionFromConfig());
		}

		return {
			memoryExpression,
			minMemory,
			maxMemory,
			input,
			runOptions,
		};
	}

	/**
	 * Helper to load the `defaultMemoryMbytes` expression from actor.json.
	 */
	private async getExpressionFromConfig(): Promise<ActorMemoryConfig> {
		const cwd = process.cwd();
		const localConfigResult = await useActorConfig({ cwd });

		if (localConfigResult.isErr()) {
			const { message, cause } = localConfigResult.unwrapErr();

			this.logger.stderr.error(
				cause
					? this.t(ActorCalculateMemoryCommandMessages.configLoadErrorWithCause, {
							message,
							cause: cause.message,
							jsonParams: [message, cause.message],
						})
					: this.t(ActorCalculateMemoryCommandMessages.configLoadError, { message, jsonParams: [message] }),
			);
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return {};
		}

		const { config: localConfig } = localConfigResult.unwrap();
		return {
			defaultMemoryMbytes: localConfig?.defaultMemoryMbytes?.toString(),
			minMemoryMbytes: localConfig?.minMemoryMbytes as number | undefined,
			maxMemoryMbytes: localConfig?.maxMemoryMbytes as number | undefined,
		};
	}
}
