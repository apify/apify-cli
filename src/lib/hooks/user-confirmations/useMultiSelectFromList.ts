import checkbox from '@inquirer/checkbox';

import { promptContext, type StdinCheckWrapperInput, stdinCheckWrapper } from './_stdinCheckWrapper.js';

export type MultiSelectChoicesType<T = unknown> = Parameters<typeof checkbox<T>>[0]['choices'];

interface UseMultiSelectFromListInput<T> {
	message: string;
	choices: MultiSelectChoicesType<T>;
	pageSize?: number;
	loop?: boolean;
}

export const useMultiSelectFromList = stdinCheckWrapper(
	async ({ message, choices, pageSize, loop }: UseMultiSelectFromListInput<unknown>) => {
		const result = await checkbox({ message, choices, pageSize, loop }, promptContext);

		return result;
	},
	{
		errorMessageForStdin: 'Please provide the selection using the command options.',
	},
) as <T>(input: UseMultiSelectFromListInput<T> & StdinCheckWrapperInput<T[]>) => Promise<T[]>;
