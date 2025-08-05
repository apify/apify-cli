import input from '@inquirer/input';

import { stdinCheckWrapper } from './_stdinCheckWrapper.js';

interface UseInputConfirmationInput {
	message: string;
	expectedValue: string;
	failureMessage?: string;
}

export const useInputConfirmation = stdinCheckWrapper(
	async ({ message, expectedValue, failureMessage }: UseInputConfirmationInput) => {
		const result = await input({
			message,
			validate(value) {
				if (value === expectedValue) {
					return true;
				}

				return failureMessage ?? 'That is not the correct input!';
			},
		});

		return result;
	},
);
