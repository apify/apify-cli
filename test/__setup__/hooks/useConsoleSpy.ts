import type { MockInstance } from 'vitest';

export function useConsoleSpy() {
	let logSpy!: MockInstance<(typeof console)['log']>;
	let errorSpy!: MockInstance<(typeof console)['error']>;

	const logMessages = {
		log: [] as string[],
		error: [] as string[],
	};

	vitest.setConfig({ restoreMocks: false });

	beforeEach(() => {
		logSpy = vitest.spyOn(console, 'log').mockImplementation((...args) => {
			logMessages.log.push(args.map(String).join(' '));
		});

		errorSpy = vitest.spyOn(console, 'error').mockImplementation((...args) => {
			logMessages.error.push(args.map(String).join(' '));
		});
	});

	return {
		get logSpy() {
			return logSpy;
		},
		get errorSpy() {
			return errorSpy;
		},
		logMessages,
	};
}
