/* eslint-disable max-classes-per-file */

import process from 'node:process';

import chalk from 'chalk';

/**
 * Minimal writable-stream contract the {@link Logger} needs. Compatible with
 * `process.stdout` / `process.stderr`, with any Node.js `Writable`, and with
 * the in-memory capture streams used in tests.
 */
export interface LoggerStream {
	write(chunk: string): unknown;
}

export interface LoggerStreams {
	stdout: LoggerStream;
	stderr: LoggerStream;
}

/**
 * The full surface of a single output channel. `logger.stdout` and
 * `logger.stderr` both satisfy this shape. Tests plug in custom
 * implementations via {@link Logger.setOutputs}.
 */
export interface LoggerOutput {
	/** Emit `message` as-is, no prefix, followed by a newline. */
	log(message: string): void;
	/** Emit `Info: {message}` with a white prefix. */
	info(message: string): void;
	/** Emit `Warning: {message}` with a bold yellow prefix. */
	warning(message: string): void;
	/** Emit `Success: {message}` with a green prefix. */
	success(message: string): void;
	/** Emit `Error: {message}` with a red prefix. */
	error(message: string): void;
	/** Emit `Run: {message}` with a gray prefix. */
	run(message: string): void;
	/** Emit a blue `{message}` followed by the URL. */
	link(message: string, url: string): void;
	/** Emit `data` as pretty-printed JSON (replaces `printJsonToStdout`). */
	json(data: unknown): void;
}

export interface LoggerOutputs {
	stdout: LoggerOutput;
	stderr: LoggerOutput;
}

class StreamLoggerOutput implements LoggerOutput {
	stream: LoggerStream;

	constructor(stream: LoggerStream) {
		this.stream = stream;
	}

	private emit(line: string): void {
		this.stream.write(`${line}\n`);
	}

	log(message: string): void {
		this.emit(message);
	}

	info(message: string): void {
		this.emit(`${chalk.white('Info:')} ${message}`);
	}

	warning(message: string): void {
		this.emit(`${chalk.yellow.bold('Warning:')} ${message}`);
	}

	success(message: string): void {
		this.emit(`${chalk.green('Success:')} ${message}`);
	}

	error(message: string): void {
		this.emit(`${chalk.red('Error:')} ${message}`);
	}

	run(message: string): void {
		this.emit(`${chalk.gray('Run:')} ${message}`);
	}

	link(message: string, url: string): void {
		this.emit(`${chalk.blue(message)} ${url}`);
	}

	json(data: unknown): void {
		this.emit(JSON.stringify(data, null, 2));
	}
}

/**
 * Output that drops every message. Used as the default channel when the
 * `APIFY_NO_LOGS_IN_TESTS` env var is set (vitest workers) so test runs stay
 * quiet unless a test opts into capture via `useConsoleSpy`.
 */
/* eslint-disable @typescript-eslint/no-empty-function */
export class NoopLoggerOutput implements LoggerOutput {
	log(): void {}
	info(): void {}
	warning(): void {}
	success(): void {}
	error(): void {}
	run(): void {}
	link(): void {}
	json(): void {}
}
/* eslint-enable @typescript-eslint/no-empty-function */

function createDefaultOutputs(): LoggerOutputs {
	if (process.env.APIFY_NO_LOGS_IN_TESTS) {
		return {
			stdout: new NoopLoggerOutput(),
			stderr: new NoopLoggerOutput(),
		};
	}
	return {
		stdout: new StreamLoggerOutput(process.stdout),
		stderr: new StreamLoggerOutput(process.stderr),
	};
}

/**
 * CLI logger with explicit `stdout` and `stderr` channels. Every channel
 * exposes the same {@link LoggerOutput} surface — call
 * `logger.stdout.info(...)` when the output is meant to be piped or scripted
 * against, and `logger.stderr.info(...)` for progress/diagnostics the user
 * reads but does not consume programmatically.
 *
 * Outputs are swappable at runtime. Production code almost never touches this;
 * tests use {@link setOutputs} to install a capturing or silent implementation.
 */
export class Logger {
	stdout: LoggerOutput;
	stderr: LoggerOutput;

	constructor(outputs: LoggerOutputs = createDefaultOutputs()) {
		this.stdout = outputs.stdout;
		this.stderr = outputs.stderr;
	}

	/**
	 * Replace the underlying outputs with arbitrary {@link LoggerOutput}
	 * implementations — e.g. the capturing output used by `useConsoleSpy`, a
	 * file-backed output, or {@link NoopLoggerOutput} to silence everything.
	 */
	setOutputs(outputs: LoggerOutputs): void {
		this.stdout = outputs.stdout;
		this.stderr = outputs.stderr;
	}

	/**
	 * Convenience shortcut: point the logger at a pair of writable streams.
	 * Equivalent to `setOutputs` with fresh {@link StreamLoggerOutput}s.
	 */
	setStreams(streams: LoggerStreams): void {
		this.stdout = new StreamLoggerOutput(streams.stdout);
		this.stderr = new StreamLoggerOutput(streams.stderr);
	}

	/** Restore the outputs the logger was constructed with (per env defaults). */
	reset(): void {
		const defaults = createDefaultOutputs();
		this.stdout = defaults.stdout;
		this.stderr = defaults.stderr;
	}
}

/**
 * Process-wide logger. Commands access the same instance through
 * `this.logger`; utility modules import it directly.
 */
export const logger = new Logger();
