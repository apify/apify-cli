import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

const ProjectRoot = new URL('../../../', import.meta.url);
const DistApify = fileURLToPath(new URL('./dist/apify.js', ProjectRoot));
const DistActor = fileURLToPath(new URL('./dist/actor.js', ProjectRoot));

export interface RunCliOptions {
	cwd?: string | URL;
	stdin?: string;
	env?: Record<string, string>;
	timeout?: number;
}

export interface RunCliResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run a CLI command against the freshly built `./dist` (requires `pnpm run build`).
 * Returns { stdout, stderr, exitCode }. Does not throw on non-zero exit codes.
 * May throw on timeout or if the binary is not found.
 *
 * @example
 * const result = await runCli('apify', ['help']);
 * expect(result.exitCode).toBe(0);
 * expect(result.stdout).toContain('apify-cli');
 */
export async function runCli(
	binary: 'apify' | 'actor',
	args: string[],
	options: RunCliOptions = {},
): Promise<RunCliResult> {
	const distFile = binary === 'actor' ? DistActor : DistApify;

	// Spawning into a non-existent cwd fails with an opaque ENOENT before the CLI
	// even runs, so ensure it exists first — every caller's cwd is a scratch dir.
	if (options.cwd) await mkdir(options.cwd, { recursive: true });

	const result = await execa('node', [distFile, ...args], {
		cwd: options.cwd,
		reject: false,
		timeout: options.timeout ?? 120_000,
		stdin: options.stdin ? 'pipe' : 'ignore',
		input: options.stdin,
		env: {
			APIFY_CLI_DISABLE_TELEMETRY: '1',
			APIFY_CLI_SKIP_UPDATE_CHECK: '1',
			...options.env,
		},
	});

	return {
		stdout: result.stdout ?? '',
		// Fall back to execa's error message so spawn failures surface instead of
		// an empty string + bare exit code 1.
		stderr: result.stderr || result.shortMessage || '',
		exitCode: result.exitCode ?? 1,
	};
}
