import password from '@inquirer/password';

import { stdinCheckWrapper } from './_stdinCheckWrapper.js';

interface UseMaskedInputInput {
	message: string;
	mask?: boolean | string;
}

export const useMaskedInput = stdinCheckWrapper(async ({ message, mask }: UseMaskedInputInput) => {
	const result = await password({ message, mask: mask ?? '*' });

	return result;
});
