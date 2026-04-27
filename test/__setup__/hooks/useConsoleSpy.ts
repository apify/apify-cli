import { appendFileSync } from 'node:fs';

import type { MockInstance } from 'vitest';

import type { LoggerOutput } from '../../../src/lib/logger.js';
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

/**
 * Installs a test-friendly {@link LoggerOutput} on the global `logger` and
 * wraps `console.log` / `console.error` so assertions can run against either
 * path. Every write is mirrored into:
 *
 *   - `logMessages.log` / `logMessages.error` for string-based matching
 *   - `logSpy()` / `errorSpy()` vitest mocks for call-count assertions
 *
 * Prefixes (`Info:`, `Warning:`, `Success:`, `Error:`, `Run:`) are preserved
 * in the captured strings (without chalk color codes) so existing tests that
 * match on those labels keep working.
 */
export function useConsoleSpy(options: ConsoleSpyOptions = { resetMessagesPerTest: true }) {
	const logMessages = {
		log: [] as string[],
		error: [] as string[],
	};

	// Mutable spy container. The capture outputs read `spies.stdout` /
	// `spies.stderr` at call time, so the fresh `vitest.fn()`s created in each
	// `beforeEach` are visible without re-installing the outputs.
	const spies = {
		stdout: null as MockInstance<(message: string) => void> | null,
		stderr: null as MockInstance<(message: string) => void> | null,
	};

	vitest.setConfig({ restoreMocks: false });

	function makeCaptureOutput(channel: 'stdout' | 'stderr'): LoggerOutput {
		const write = (formatted: string) => {
			const bucket = channel === 'stdout' ? logMessages.log : logMessages.error;
			bucket.push(formatted);
			const spy = channel === 'stdout' ? spies.stdout : spies.stderr;
			spy?.(formatted);
		};

		return {
			log: (message) => write(message),
			info: (message) => write(`Info: ${message}`),
			warning: (message) => write(`Warning: ${message}`),
			success: (message) => write(`Success: ${message}`),
			error: (message) => write(`Error: ${message}`),
			run: (message) => write(`Run: ${message}`),
			link: (message, url) => write(`${message} ${url}`),
			json: (data) => write(JSON.stringify(data, null, 2)),
		};
	}

	logger.setOutputs({
		stdout: makeCaptureOutput('stdout'),
		stderr: makeCaptureOutput('stderr'),
	});

	beforeEach(() => {
		if (options.resetMessagesPerTest) {
			logMessages.log = [];
			logMessages.error = [];
		}

		// Fresh mocks per test so `toHaveBeenCalledTimes` assertions are scoped
		// to a single test without needing explicit `mockClear()` calls.
		spies.stdout = vitest.fn();
		spies.stderr = vitest.fn();

		// Some commands still write directly via `console.log` / `console.error`
		// (e.g. help rendering, raw JSON dumps). Mirror those calls into the
		// same arrays/spies so tests don't need to care which path produced the
		// output.
		vitest.spyOn(console, 'log').mockImplementation((...args) => {
			const combined = args.map(maybeStringify).join(' ');
			logMessages.log.push(combined);
			spies.stdout?.(combined);
		});
		vitest.spyOn(console, 'error').mockImplementation((...args) => {
			const combined = args.map(maybeStringify).join(' ');
			logMessages.error.push(combined);
			spies.stderr?.(combined);
		});
	});

	afterAll(() => {
		// Return the global logger to its environment-appropriate defaults so
		// subsequent suites (or post-suite teardown) don't inherit the capture
		// outputs installed above.
		logger.reset();
	});

	return {
		logSpy() {
			return spies.stdout!;
		},
		errorSpy() {
			return spies.stderr!;
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
