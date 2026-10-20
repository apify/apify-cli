import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';

import { CliTestEnv, DistActor, DistApify } from './run-cli.js';

export interface RunCliBoundedOptions {
	cwd: string;
	/** Wall-clock budget. The child is killed once it elapses. */
	timeoutMs?: number;
	/** Combined byte budget for stdout and stderr. The child is killed once it is passed. */
	outputCapBytes?: number;
}

export interface RunCliBoundedResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	/** The command was still running when `timeoutMs` elapsed. */
	timedOut: boolean;
	/** The command wrote past `outputCapBytes`, which only a runaway loop does. */
	outputCapExceeded: boolean;
	/** Bytes written across both streams, up to the point the child was killed. */
	bytesWritten: number;
}

const DefaultTimeoutMs = 15_000;

/** Two orders of magnitude above any command's real output, and a few milliseconds of a loop. */
const DefaultOutputCapBytes = 256 * 1024;

/**
 * Run a built CLI command (requires `pnpm run build`) with stdin pointed at `/dev/null`.
 *
 * A deadline alone cannot tell a hang from a retry loop, and costs the full deadline either way.
 * The output cap separates them in milliseconds: `outputCapExceeded` means the command retried
 * something it can never succeed at. Use `runCli` for everything that does not prompt.
 */
export async function runCliBounded(
	binary: 'apify' | 'actor',
	args: string[],
	options: RunCliBoundedOptions,
): Promise<RunCliBoundedResult> {
	const { cwd, timeoutMs = DefaultTimeoutMs, outputCapBytes = DefaultOutputCapBytes } = options;

	await mkdir(cwd, { recursive: true });

	const child = spawn(process.execPath, [binary === 'actor' ? DistActor : DistApify, ...args], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
		// `spawn` replaces the environment wholesale, unlike execa's `extendEnv`.
		env: {
			...process.env,
			...CliTestEnv,
		},
	});

	const captured = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
	let bytesWritten = 0;
	let outputCapExceeded = false;
	let timedOut = false;

	const capture = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
		bytesWritten += chunk.length;

		// Keep the head only: the tail after the cap is unbounded and carries nothing the assertions read.
		if (!outputCapExceeded) captured[stream].push(chunk);

		if (bytesWritten > outputCapBytes && !outputCapExceeded) {
			outputCapExceeded = true;
			child.kill('SIGKILL');
		}
	};

	child.stdout.on('data', capture('stdout'));
	child.stderr.on('data', capture('stderr'));

	const timer = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, timeoutMs);

	const exitCode = await new Promise<number | null>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	}).finally(() => clearTimeout(timer));

	return {
		stdout: Buffer.concat(captured.stdout).toString('utf8'),
		stderr: Buffer.concat(captured.stderr).toString('utf8'),
		exitCode,
		timedOut,
		outputCapExceeded,
		bytesWritten,
	};
}
