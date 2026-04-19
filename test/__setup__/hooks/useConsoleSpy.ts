import { appendFileSync } from 'node:fs';
import process from 'node:process';

import type { MockInstance } from 'vitest';

import { logger } from '../../../src/lib/logger.js';

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

function stripTrailingNewline(chunk: string): string {
	return chunk.replace(/\r?\n$/, '');
}

export function useConsoleSpy(options: ConsoleSpyOptions = { resetMessagesPerTest: true }) {
	let logSpy!: MockInstance<(typeof console)['log']>;
	let errorSpy!: MockInstance<(typeof console)['error']>;

	const logMessages = {
		log: [] as string[],
		error: [] as string[],
	};

	vitest.setConfig({ restoreMocks: false });

	// Route every `logger.stdout.*` / `logger.stderr.*` write into the same
	// arrays the console spies populate. The closures read `logMessages.log` /
	// `logMessages.error` on each call so that the per-test reassignment in
	// `beforeEach` (below) still captures new writes into the fresh arrays.
	logger.setStreams({
		stdout: {
			write(chunk: string) {
				logMessages.log.push(stripTrailingNewline(String(chunk)));
				return true;
			},
		},
		stderr: {
			write(chunk: string) {
				logMessages.error.push(stripTrailingNewline(String(chunk)));
				return true;
			},
		},
	});

	beforeEach(() => {
		if (options.resetMessagesPerTest) {
			logMessages.log = [];
			logMessages.error = [];
		}

		logSpy = vitest.spyOn(console, 'log').mockImplementation((...args) => {
			logMessages.log.push(args.map(maybeStringify).join(' '));
		});

		errorSpy = vitest.spyOn(console, 'error').mockImplementation((...args) => {
			logMessages.error.push(args.map(maybeStringify).join(' '));
		});
	});

	afterAll(() => {
		// Return the logger to real process streams so post-suite teardown
		// (and any subsequent suite that did not opt into the spy) writes to
		// the real console.
		logger.setStreams({ stdout: process.stdout, stderr: process.stderr });
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
