import input from '@inquirer/input';

import { stdinCheckWrapper } from './_stdinCheckWrapper.js';

interface UseUserInputInput {
	message: string;
	validate?: (value: string) => boolean | string;
	default?: string;
}

export const useUserInput = stdinCheckWrapper(
	async ({ message, validate, default: defaultValue }: UseUserInputInput) => {
		const result = await input({ message, validate, default: defaultValue });

		return result;
	},
	{
		errorMessageForStdin: 'Please provide a valid input based on the command options.',
	},
);
