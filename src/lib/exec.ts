import { spawn, type SpawnOptions, type SpawnOptionsWithoutStdio } from 'node:child_process';

import { normalizeExecutablePath } from './hooks/runtimes/utils.js';
import { run } from './outputs.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const windowsOptions: SpawnOptions = {
	shell: true,
	windowsHide: true,
};

/**
 * Run child process and returns stdout and stderr to user stout
 */
const spawnPromised = async (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio) => {
	const escapedCommand = normalizeExecutablePath(cmd);

	cliDebugPrint('SpawnPromised', { escapedCommand, args, opts });

	// NOTE: Pipes stderr, stdout to main process
	const childProcess = spawn(escapedCommand, args, {
		...opts,
		stdio: process.env.APIFY_NO_LOGS_IN_TESTS ? 'ignore' : 'inherit',
		...(process.platform === 'win32' ? windowsOptions : {}),
	});

	// Catch ctrl-c (SIGINT) and kills child process
	// NOTE: This fix kills also puppeteer child node process
	process.on('SIGINT', () => {
		try {
			childProcess.kill('SIGINT');
		} catch {
			// SIGINT can come after the child process is finished, ignore it
		}
	});

	return new Promise<void>((resolve, reject) => {
		childProcess.on('error', reject);
		childProcess.on('close', (code) => {
			if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
			resolve();
		});
	});
};

export interface ExecWithLogOptions {
	cmd: string;
	args?: string[];
	opts?: SpawnOptionsWithoutStdio;
	overrideCommand?: string;
}

export async function execWithLog({ cmd, args = [], opts = {}, overrideCommand }: ExecWithLogOptions) {
	run({ message: `${overrideCommand || cmd} ${args.join(' ')}` });
	await spawnPromised(cmd, args, opts);
}
