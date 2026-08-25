import select from '@inquirer/select';

import type { StdinCheckWrapperInput } from './_stdinCheckWrapper.js';
import { promptContext, stdinCheckWrapper } from './_stdinCheckWrapper.js';

export type ChoicesType<T = unknown> = Parameters<typeof select<T>>[0]['choices'];

interface UseSelectFromListInput<T> {
	message: string;
	choices: ChoicesType<T>;
	pageSize?: number;
	loop?: boolean;
	default?: unknown;
}

export const useSelectFromList = stdinCheckWrapper(
	async ({ message, choices, pageSize, loop, default: defaultValue }: UseSelectFromListInput<unknown>) => {
		const result = await select({ message, choices, pageSize, loop, default: defaultValue }, promptContext);

		return result;
	},
	{
		errorMessageForStdin: 'Please provide the selection using the command options.',
	},
	// The cast has to keep StdinCheckWrapperInput: the wrapper reads `providedConfirmFromStdin` at runtime,
	// so dropping it here made the non-interactive fallback impossible to pass without a type error.
) as <T>(input: UseSelectFromListInput<T> & StdinCheckWrapperInput<T>) => Promise<T>;
