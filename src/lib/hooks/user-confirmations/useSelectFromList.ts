import select from '@inquirer/select';

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
) as <T>(input: UseSelectFromListInput<T>) => Promise<T>;
