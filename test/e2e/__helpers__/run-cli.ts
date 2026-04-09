import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
import isCI from 'is-ci';

const ProjectRoot = new URL('../../../', import.meta.url);
const DistApify = fileURLToPath(new URL('./dist/apify.js', ProjectRoot));
const DistActor = fileURLToPath(new URL('./dist/actor.js', ProjectRoot));

const VALID_MODES = ['dist', 'npx', 'global'] as const;

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
 * Parse a command string like "apify builds create --json" into
 * { binary: 'apify' | 'actor', args: ['builds', 'create', '--json'] }
 */
function parseCommand(raw: string): { binary: 'apify' | 'actor'; args: string[] } {
	const trimmed = raw.replace(/^\$\s*/, '').trim();

	if (!trimmed.startsWith('apify') && !trimmed.startsWith('actor')) {
		throw new Error(`Command must start with 'apify' or 'actor', got: ${trimmed}`);
	}

	const binary = trimmed.startsWith('actor') ? 'actor' : 'apify';
	const rest = trimmed.replace(/^(apify|actor)\s*/, '');
	const args = rest ? rest.split(/\s+/) : [];

	return { binary, args };
}

/**
 * Resolve the executable and arguments based on the current mode.
 */
function resolveExec(binary: 'apify' | 'actor', args: string[]): { file: string; args: string[] } {
	const mode = process.env.APIFY_CLI_E2E_MODE?.toLowerCase() ?? (isCI ? 'npx' : 'dist');

	switch (mode) {
		case 'dist': {
			const distFile = binary === 'actor' ? DistActor : DistApify;
			return { file: 'node', args: [distFile, ...args] };
		}
		case 'npx': {
			if (binary === 'actor') {
				return { file: 'npx', args: ['-p', 'apify-cli@beta', 'actor', ...args] };
			}
			return { file: 'npx', args: ['apify-cli@beta', ...args] };
		}
		case 'global': {
			return { file: binary, args };
		}
		default: {
			throw new Error(
				`Invalid APIFY_CLI_E2E_MODE value: "${process.env.APIFY_CLI_E2E_MODE}". Expected one of: ${VALID_MODES.join(', ')}`,
			);
		}
	}
}

/**
 * Run a CLI command and return { stdout, stderr, exitCode }.
 * Does not throw on non-zero exit codes. May throw on timeout or if the binary is not found.
 *
 * Execution mode controlled by APIFY_CLI_E2E_MODE env var (auto-detects CI when unset):
 *   "dist"           → node ./dist/apify.js <args>    (default locally, after `yarn build`)
 *   "npx"            → npx apify-cli@beta <args>      (default in CI, tests the published package)
 *   "global"         → apify <args>                    (tests globally installed binary)
 *
 * @example
 * const result = await runCli('apify help');
 * expect(result.exitCode).toBe(0);
 * expect(result.stdout).toContain('apify-cli');
 */
export async function runCli(command: string, options: RunCliOptions = {}): Promise<RunCliResult> {
	const { binary, args } = parseCommand(command);
	const exec = resolveExec(binary, args);

	const result = await execa(exec.file, exec.args, {
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
		stderr: result.stderr ?? '',
		exitCode: result.exitCode ?? 1,
	};
}
