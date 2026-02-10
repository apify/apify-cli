import select from '@inquirer/select';

import { stdinCheckWrapper } from './_stdinCheckWrapper.js';

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
		const result = await select({ message, choices, pageSize, loop, default: defaultValue });

		return result;
	},
) as <T>(input: UseSelectFromListInput<T>) => Promise<T>;
