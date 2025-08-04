import isCI from 'is-ci';

import { useStdin } from '../useStdin.js';

export interface StdinCheckWrapperInput<ReturnedType> extends StdinCheckWrapperOptions {
	/**
	 * When set, this value will be used in environments where stdin is not available.
	 */
	providedConfirmFromStdin?: ReturnedType;
}

type AllButFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never;

type NewFunctionArgs<Fn extends (...args: any[]) => any> = [
	Parameters<Fn>[0] & StdinCheckWrapperInput<Awaited<ReturnType<Fn>>>,
	...AllButFirst<Parameters<Fn>>,
];

const ConfirmFlag = 'confirm';
const NoConfirmFlag = `no-${ConfirmFlag}`;

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
		errorMessageForStdin = `Please use the --${ConfirmFlag}/--${NoConfirmFlag} flags to confirm the action.`,
	}: StdinCheckWrapperOptions = {},
): (...args: NewFunctionArgs<Fn>) => Promise<Awaited<ReturnType<Fn>>> {
	return async (input, ...rest) => {
		const { isTTY, hasData } = await useStdin();

		const casted = input as StdinCheckWrapperInput<Awaited<ReturnType<Fn>>>;

		if (isCI || (!isTTY && !hasData)) {
			if (typeof casted.providedConfirmFromStdin === 'undefined') {
				throw new Error(
					casted.errorMessageForStdin ??
						errorMessageForStdin ??
						`Please use the --${ConfirmFlag}/--${NoConfirmFlag} flags to confirm the action.`,
				);
			}

			return casted.providedConfirmFromStdin;
		}

		const res = await fn(input, ...rest);

		return res;
	};
}
