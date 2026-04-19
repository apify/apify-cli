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
 * `logger.stderr` both satisfy this shape.
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
 * CLI logger with explicit `stdout` and `stderr` channels. Every channel
 * exposes the same {@link LoggerOutput} surface — call
 * `logger.stdout.info(...)` when the output is meant to be piped or scripted
 * against, and `logger.stderr.info(...)` for progress/diagnostics the user
 * reads but does not consume programmatically.
 *
 * Streams are swappable at runtime (see {@link setStreams}); tests rely on
 * this to capture output without stubbing `console`.
 */
export class Logger {
	readonly stdout: LoggerOutput;
	readonly stderr: LoggerOutput;

	constructor(streams: LoggerStreams = { stdout: process.stdout, stderr: process.stderr }) {
		this.stdout = new StreamLoggerOutput(streams.stdout);
		this.stderr = new StreamLoggerOutput(streams.stderr);
	}

	/**
	 * Replace the underlying stdout/stderr streams. Primarily used by the test
	 * hook {@link useConsoleSpy} to redirect output into assertable arrays;
	 * production code almost never needs to call this.
	 */
	setStreams(streams: LoggerStreams): void {
		(this.stdout as StreamLoggerOutput).stream = streams.stdout;
		(this.stderr as StreamLoggerOutput).stream = streams.stderr;
	}
}

/**
 * Process-wide logger. Commands access the same instance through
 * `this.logger`; utility modules import it directly.
 */
export const logger = new Logger();
