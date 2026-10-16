import { type CheckboxChoice, checkboxImpl } from '../../utils/inquirer/checkboxImpl.js';
import { promptContext, type StdinCheckWrapperInput, stdinCheckWrapper } from './_stdinCheckWrapper.js';

interface UseMultiSelectFromListInput<T> {
	message: string;
	choices: CheckboxChoice<T>[];
	pageSize?: number;
	loop?: boolean;
}

export const useMultiSelectFromList = stdinCheckWrapper(
	async ({ message, choices, pageSize, loop }: UseMultiSelectFromListInput<unknown>) => {
		const result = await checkboxImpl({ message, choices, pageSize, loop }, promptContext);

		return result;
	},
	{
		errorMessageForStdin: 'Please provide the selection using the command options.',
	},
) as <T>(input: UseMultiSelectFromListInput<T> & StdinCheckWrapperInput<T[]>) => Promise<T[]>;
