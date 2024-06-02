import chalk from 'chalk';

export interface LogOptions {
	stdoutOutput?: unknown[];
	stderrOutput?: unknown[];
}

function internalLog(options: LogOptions) {
	if (options.stdoutOutput) {
		console.log(...options.stdoutOutput);
	}

	if (options.stderrOutput) {
		console.error(...options.stderrOutput);
	}
}

export interface SimpleLogOptions {
	stdout?: boolean;
	message: string;
}

export function simpleLog(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [options.message],
	});
}

export function error(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.red('Error:'), options.message],
	});
}

export function warning(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.rgb(254, 90, 29).bold('Warning:'), options.message],
	});
}

export function success(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.green('Success:'), options.message],
	});
}

export function run(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.gray('Run:'), options.message],
	});
}

export function info(options: SimpleLogOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.white('Info:'), options.message],
	});
}

export interface SimpleLinkOptions extends SimpleLogOptions {
	url: string;
}

export function link(options: SimpleLinkOptions) {
	internalLog({
		[options.stdout ? 'stdoutOutput' : 'stderrOutput']: [chalk.blue(options.message), options.url],
	});
}
