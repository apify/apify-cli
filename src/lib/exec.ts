import { Result } from '@sapphire/result';
import { execa, type ExecaError, type Options } from 'execa';

import { normalizeExecutablePath } from './hooks/runtimes/utils.js';
import { logger } from './logger.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

interface SpawnPromisedInternalOptions {
	/**
	 * Signals that should be forwarded from the parent process to the spawned
	 * child. When the CLI receives one of these signals it is re-sent to the
	 * child so it can shut down cleanly instead of being orphaned when the CLI
	 * exits.
	 */
	forwardSignals?: NodeJS.Signals[];
}

const spawnPromised = async (
	cmd: string,
	args: string[],
	opts: Options,
	{ forwardSignals }: SpawnPromisedInternalOptions = {},
) => {
	const escapedCommand = normalizeExecutablePath(cmd);

	cliDebugPrint('spawnPromised', { escapedCommand, args, opts, forwardSignals });

	const childProcess = execa(escapedCommand, args, {
		shell: true,
		windowsHide: true,
		env: opts.env,
		cwd: opts.cwd,
		// Pipe means it gets collected by the parent process, inherit means it gets collected by the parent process and printed out to the console
		stdout: process.env.APIFY_NO_LOGS_IN_TESTS ? ['pipe'] : ['pipe', 'inherit'],
		stderr: process.env.APIFY_NO_LOGS_IN_TESTS ? ['pipe'] : ['pipe', 'inherit'],
		verbose: process.env.APIFY_CLI_DEBUG ? 'full' : undefined,
	});

	const cleanupSignalHandlers: (() => void)[] = [];

	if (forwardSignals?.length) {
		for (const signal of forwardSignals) {
			const handler = () => {
				childProcess.kill(signal);
			};

			process.on(signal, handler);
			cleanupSignalHandlers.push(() => process.off(signal, handler));
		}
	}

	try {
		return (await Result.fromAsync(
			childProcess.catch((execaError: ExecaError) => {
				let message;

				if (execaError.exitCode != null) {
					message = `${cmd} exited with code ${execaError.exitCode}`;
				} else if (execaError.signal) {
					message = `${cmd} exited due to signal ${execaError.signal}`;
				} else {
					message = execaError.shortMessage;
				}

				throw new Error(message, { cause: execaError });
			}),
		)) as Result<Awaited<typeof childProcess>, Error & { cause: ExecaError }>;
	} finally {
		for (const cleanup of cleanupSignalHandlers) {
			cleanup();
		}
	}
};

export interface ExecWithLogOptions {
	cmd: string;
	args?: string[];
	opts?: Options;
	overrideCommand?: string;
	/**
	 * Signals to forward from the parent process to the spawned child. Use this
	 * for long-running children (e.g. user scripts) so pressing Ctrl+C on the
	 * CLI does not leave the child running in the background.
	 */
	forwardSignals?: NodeJS.Signals[];
}

export async function execWithLog({ cmd, args = [], opts = {}, overrideCommand, forwardSignals }: ExecWithLogOptions) {
	logger.stderr.run(`${overrideCommand || cmd} ${args.join(' ')}`);
	const result = await spawnPromised(cmd, args, opts, { forwardSignals });

	if (result.isErr()) {
		const err = result.unwrapErr();
		logger.stderr.error(err.message);

		if (err.cause) {
			throw err.cause;
		}
	}
}
