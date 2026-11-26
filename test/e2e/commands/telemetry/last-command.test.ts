import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

import { CliTestEnv, DistApify, runCli } from '../../__helpers__/run-cli.js';
import { TestTmpRoot } from '../../__helpers__/tmp.js';

describe('[e2e] the command apify feedback reports on', () => {
	let configDir: string;
	let projectDir: string;
	let env: Record<string, string>;

	// `apify feedback` sends `last_command` and `last_command_exit_code` straight from this file.
	function recordedLastCommand() {
		const state = JSON.parse(readFileSync(join(configDir, 'telemetry.json'), 'utf-8'));
		return { command: state.lastCommand, exitCode: state.lastCommandExitCode };
	}

	beforeEach(async () => {
		const authPath = `e2e-last-command-${randomBytes(6).toString('hex')}`;
		configDir = join(homedir(), '.apify', authPath);
		projectDir = join(TestTmpRoot, authPath);
		env = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		await mkdir(projectDir, { recursive: true });

		const earlier = await runCli('apify', ['telemetry', 'disable'], { env });
		expect(earlier.exitCode, `stderr: ${earlier.stderr}`).toBe(0);
	});

	afterEach(async () => {
		await rm(configDir, { recursive: true, force: true });
		await rm(projectDir, { recursive: true, force: true });
	});

	it('is a command that failed while running', async () => {
		const failed = await runCli('apify', ['validate-schema', './missing.json'], { env });
		expect(failed.exitCode).toBe(1);

		expect(recordedLastCommand()).toEqual({ command: 'validate-schema', exitCode: 1 });
	});

	it('is a command that hung and was interrupted', async () => {
		let onRequest!: () => void;
		const requested = new Promise<void>((resolve) => {
			onRequest = resolve;
		});

		// An API that never answers, the way a hung network call looks to the CLI.
		const server = createServer(() => onRequest());
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

		try {
			const hung = execa('node', [DistApify, 'info'], {
				reject: false,
				stdin: 'ignore',
				env: {
					...CliTestEnv,
					...env,
					APIFY_TOKEN: 'not-a-real-token',
					APIFY_CLIENT_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
				},
			});

			await requested;
			hung.kill('SIGINT');
			await hung;
		} finally {
			server.closeAllConnections();
			server.close();
		}

		expect(recordedLastCommand()).toEqual({ command: 'info', exitCode: undefined });
	});

	it('is apify run when the Actor it ran called the CLI itself', async () => {
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'last-command', type: 'module', scripts: { start: 'node main.js' } }),
		);
		await writeFile(
			join(projectDir, 'main.js'),
			[
				"import { execFileSync } from 'node:child_process';",
				`execFileSync(process.execPath, [${JSON.stringify(DistApify)}, 'telemetry', 'disable']);`,
				'process.exit(1);',
			].join('\n'),
		);

		const failed = await runCli('apify', ['run'], { env, cwd: projectDir });
		expect(failed.exitCode).toBe(1);

		expect(recordedLastCommand()).toEqual({ command: 'run', exitCode: 1 });
	});

	it('is a command that failed on an unknown flag', async () => {
		const failed = await runCli('apify', ['validate-schema', '--bogus-flag'], { env });
		expect(failed.exitCode).toBe(1);

		expect(recordedLastCommand()).toEqual({ command: 'validate-schema', exitCode: 1 });
	});

	it('is a command that failed on a missing required argument', async () => {
		const failed = await runCli('apify', ['secrets', 'add'], { env });
		expect(failed.exitCode).toBe(1);

		expect(recordedLastCommand()).toEqual({ command: 'secrets add', exitCode: 1 });
	});

	it("isn't a help command read before reporting", async () => {
		const help = await runCli('apify', ['help', 'feedback'], { env });
		expect(help.exitCode).toBe(0);

		expect(recordedLastCommand()).toEqual({ command: 'telemetry disable', exitCode: 0 });
	});
});
