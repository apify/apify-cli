import { Result } from '@sapphire/result';
import { execa, type ExecaError, type Options } from 'execa';

import { normalizeExecutablePath } from './hooks/runtimes/utils.js';
import { error, run } from './outputs.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const spawnPromised = async (cmd: string, args: string[], opts: Options) => {
	const escapedCommand = normalizeExecutablePath(cmd);

	cliDebugPrint('spawnPromised2', { escapedCommand, args, opts });

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

	return Result.fromAsync(
		childProcess.catch((execaError: ExecaError) => {
			throw new Error(`${cmd} exited with code ${execaError.exitCode}`, { cause: execaError });
		}),
	) as Promise<Result<Awaited<typeof childProcess>, Error & { cause: ExecaError }>>;
};

export interface ExecWithLogOptions {
	cmd: string;
	args?: string[];
	opts?: Options;
	overrideCommand?: string;
}

export async function execWithLog({ cmd, args = [], opts = {}, overrideCommand }: ExecWithLogOptions) {
	run({ message: `${overrideCommand || cmd} ${args.join(' ')}` });
	const result = await spawnPromised(cmd, args, opts);

	if (result.isErr()) {
		const err = result.unwrapErr();
		error({ message: err.message });

		if (err.cause) {
			throw err.cause;
		}
	}
}
