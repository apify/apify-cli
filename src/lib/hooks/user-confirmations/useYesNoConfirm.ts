import confirmImpl from '../../utils/inquirer/confirmImpl.js';
import { stdinCheckWrapper } from './_stdinCheckWrapper.js';

interface UseYesNoConfirmInput {
	message: string;
	default?: boolean;
}

export const useYesNoConfirm = stdinCheckWrapper(async ({ message, default: defaultValue }: UseYesNoConfirmInput) => {
	const result = await confirmImpl({ message, default: defaultValue });

	return result;
});
