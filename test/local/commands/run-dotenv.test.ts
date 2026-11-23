import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { getLocalDatasetPath } from '../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actName = 'run-dotenv';

useAuthSetup({ perTest: true });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { logMessages } = useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');
// The command sets the exit code on this mocked copy of `node:process`, not on the global one.
const { default: commandProcess } = await import('node:process');

const RECORDED_VARS = ['FROM_SHELL', 'CRAWLEE_PURGE_ON_START', 'FROM_DOTENV', 'SECRET_REF', 'EMPTY', 'BAD-NAME'];

describe('apify run with .env', () => {
	let originalActorJson: string;
	let resultPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();

		resultPath = joinPath('env-result.json');
		originalActorJson = readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8');

		writeFileSync(
			joinPath('src/main.js'),
			`
import { writeFileSync } from 'node:fs';
const names = ${JSON.stringify(RECORDED_VARS)};
writeFileSync(String.raw\`${resultPath}\`, JSON.stringify(Object.fromEntries(names.map((name) => [name, process.env[name] ?? null]))));
`,
			{ flag: 'w' },
		);
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), originalActorJson);
		rmSync(joinPath('.env'), { force: true });
		rmSync(resultPath, { force: true });
	});

	afterEach(() => {
		vitest.unstubAllEnvs();
		process.exitCode = undefined;
		commandProcess.exitCode = undefined;
	});

	const setEnvironmentVariables = (environmentVariables: Record<string, string>) => {
		const actorJson = JSON.parse(originalActorJson);
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify({ ...actorJson, environmentVariables }, null, '\t'));
	};

	const runAndReadEnv = async (): Promise<Record<string, string | null>> => {
		await testRunCommand(RunCommand, {});
		expect(existsSync(resultPath)).toBe(true);
		return JSON.parse(readFileSync(resultPath, 'utf8'));
	};

	it('applies shell < CLI-set vars < .env', async () => {
		for (const name of ['FROM_SHELL', 'CRAWLEE_PURGE_ON_START', 'FROM_DOTENV']) {
			vitest.stubEnv(name, 'shell');
		}
		writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\n');

		const env = await runAndReadEnv();

		expect(env.FROM_SHELL).toBe('shell');
		expect(env.CRAWLEE_PURGE_ON_START).toMatch(/^[01]$/);
		expect(env.FROM_DOTENV).toBe('dotenv');
	});

	it('lets .env override a CLI-set var', async () => {
		writeFileSync(joinPath('.env'), 'CRAWLEE_PURGE_ON_START=dotenv\n');

		expect((await runAndReadEnv()).CRAWLEE_PURGE_ON_START).toBe('dotenv');
	});

	describe('removed environmentVariables', () => {
		const REMOVED =
			'"environmentVariables" in .actor/actor.json is no longer supported. Run apify env migrate to move the values to .env.';

		it.each([
			['plain values', { PLAIN: 's3cr3t-sentinel' }],
			['a @secret reference', { SECRET_REF: '@mySecret' }],
		])(
			'fails with one line and exit code 5 for %s, without running the Actor',
			async (_label, environmentVariables) => {
				setEnvironmentVariables(environmentVariables);
				writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\n');

				await testRunCommand(RunCommand, {});

				expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
				expect(logMessages.error.filter((line) => line.includes(REMOVED))).toHaveLength(1);
				expect(existsSync(resultPath)).toBe(false);
				expect([...logMessages.log, ...logMessages.error].join('\n')).not.toContain('s3cr3t-sentinel');
			},
		);

		it('ignores an empty environmentVariables', async () => {
			setEnvironmentVariables({});
			writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\n');

			const env = await runAndReadEnv();

			expect(commandProcess.exitCode).toBeFalsy();
			expect(env.FROM_DOTENV).toBe('dotenv');
			expect(logMessages.error.join('\n')).not.toContain('environmentVariables');
		});
	});

	it('passes @secret references and empty values in .env literally', async () => {
		writeFileSync(joinPath('.env'), 'SECRET_REF=@foo\nEMPTY=\n');

		const env = await runAndReadEnv();

		expect(env.SECRET_REF).toBe('@foo');
		expect(env.EMPTY).toBe('');
	});

	it('skips malformed .env lines and names them only by number', async () => {
		writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\nNO_EQUALS_SIGN\nBAD-NAME=bad-value\n');

		const env = await runAndReadEnv();

		expect(env.FROM_DOTENV).toBe('dotenv');
		expect(env['BAD-NAME']).toBeNull();
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain(`Skipped 2 malformed lines in ${joinPath('.env')} (lines 2, 3).`);
		expect(stderr).not.toMatch(/NO_EQUALS_SIGN|BAD-NAME|bad-value/);
	});

	it('skips a value with a NUL character and never prints it', async () => {
		writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\nSECRET_REF=hunter2-very-secret\0tail\n');

		const env = await runAndReadEnv();

		expect(env.FROM_DOTENV).toBe('dotenv');
		expect(env.SECRET_REF).toBeNull();
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain(`Skipped 1 malformed line in ${joinPath('.env')} (line 2).`);
		expect(stderr).not.toContain('hunter2');
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
		'stops before purging storage when .env cannot be read',
		async () => {
			const datasetItem = joinPath(getLocalDatasetPath(), '000000001.json');
			mkdirSync(joinPath(getLocalDatasetPath()), { recursive: true });
			writeFileSync(datasetItem, '{}');
			writeFileSync(joinPath('.env'), 'A=one\n');
			chmodSync(joinPath('.env'), 0o000);

			await testRunCommand(RunCommand, { flags_purge: true });

			// The exit code is checked in dotenv.test.ts: useTempPath mocks node:process, so this file can't see it.
			expect(logMessages.error.join('\n')).toContain(`Couldn't read ${joinPath('.env')} (EACCES).`);
			expect(existsSync(resultPath)).toBe(false);
			expect(existsSync(datasetItem)).toBe(true);
		},
	);
});
