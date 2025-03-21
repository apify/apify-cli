import { appendFileSync } from 'node:fs';

import type { MockInstance } from 'vitest';

interface ConsoleSpyOptions {
	/**
	 * Whether the log messages should reset between tests
	 * @default true
	 */
	resetMessagesPerTest?: boolean;
}

function maybeStringify(itm: unknown): string {
	switch (typeof itm) {
		case 'string':
			return itm;
		case 'object':
			return JSON.stringify(itm);
		default:
			return String(itm);
	}
}

export function useConsoleSpy(options: ConsoleSpyOptions = { resetMessagesPerTest: true }) {
	let logSpy!: MockInstance<(typeof console)['log']>;
	let errorSpy!: MockInstance<(typeof console)['error']>;

	const logMessages = {
		log: [] as string[],
		error: [] as string[],
	};

	vitest.setConfig({ restoreMocks: false });

	beforeEach(() => {
		logSpy = vitest.spyOn(console, 'log').mockImplementation((...args) => {
			logMessages.log.push(args.map(maybeStringify).join(' '));
		});

		errorSpy = vitest.spyOn(console, 'error').mockImplementation((...args) => {
			logMessages.error.push(args.map(maybeStringify).join(' '));
		});

		if (options.resetMessagesPerTest) {
			logMessages.log = [];
			logMessages.error = [];
		}
	});

	return {
		logSpy() {
			return logSpy;
		},
		errorSpy() {
			return errorSpy;
		},
		logMessages,
		lastLogMessage() {
			return logMessages.log[logMessages.log.length - 1];
		},
		lastErrorMessage() {
			return logMessages.error[logMessages.error.length - 1];
		},
		printToStdout(object: unknown) {
			appendFileSync('test-output.txt', `\n\n\n${JSON.stringify(object, null, 2)}\n\n\n`);
		},
	};
}
