import process from 'node:process';

import { isCI } from 'ci-info';

import { useStdin } from '../useStdin.js';

/**
 * Inquirer renders to stdout by default. Prompts are UI, not command output, so they must stay off
 * stdout, otherwise they corrupt the payload of commands invoked with `--json`.
 */
export const promptContext = { output: process.stderr };

export interface StdinCheckWrapperInput<ReturnedType> extends StdinCheckWrapperOptions {
	/**
	 * When set, this value will be used in environments where stdin is not available.
	 */
	providedConfirmFromStdin?: ReturnedType;

	/**
	 * When set, the user has already answered on the command line (for example with `--yes`), so no
	 * prompt is shown at all, not even on a TTY.
	 */
	preAnswered?: ReturnedType;
}

type AllButFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never;

type NewFunctionArgs<Fn extends (...args: any[]) => any> = [
	Parameters<Fn>[0] & StdinCheckWrapperInput<Awaited<ReturnType<Fn>>>,
	...AllButFirst<Parameters<Fn>>,
];

interface StdinCheckWrapperOptions {
	/**
	 * When set, this value will be used in environments where stdin is not available to provide a custom error message.
	 *
	 * It can be provided at the wrapped function level, or as a parameter to the called function.
	 * The priority is:
	 * - called function input if present
	 * - wrapped function input if present
	 * - default error message otherwise
	 */
	errorMessageForStdin?: string;
}

export function stdinCheckWrapper<Fn extends (...args: any[]) => any>(
	fn: Fn,
	{
		errorMessageForStdin = "Can't prompt for an answer here. Re-run in an interactive terminal, or pass the answer using the command's options.",
	}: StdinCheckWrapperOptions = {},
): (...args: NewFunctionArgs<Fn>) => Promise<Awaited<ReturnType<Fn>>> {
	return async (input, ...rest) => {
		const casted = input as StdinCheckWrapperInput<Awaited<ReturnType<Fn>>>;

		// The answer came in on the command line, so there is nothing to ask and no reason to touch stdin.
		if (typeof casted.preAnswered !== 'undefined') {
			return casted.preAnswered;
		}

		const { isTTY, hasData } = await useStdin();

		if (isCI || (!isTTY && !hasData)) {
			if (typeof casted.providedConfirmFromStdin === 'undefined') {
				throw new Error(casted.errorMessageForStdin ?? errorMessageForStdin);
			}

			return casted.providedConfirmFromStdin;
		}

		const res = await fn(input, ...rest);

		return res;
	};
}
