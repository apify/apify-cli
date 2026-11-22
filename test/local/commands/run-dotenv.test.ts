import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
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

const RECORDED_VARS = ['FROM_SHELL', 'CRAWLEE_PURGE_ON_START', 'FROM_ACTOR_JSON', 'FROM_DOTENV', 'SECRET_REF'];

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

	it('runs without .env and applies environmentVariables', async () => {
		setEnvironmentVariables({ FROM_ACTOR_JSON: 'actor-json' });

		const env = await runAndReadEnv();

		expect(env.FROM_ACTOR_JSON).toBe('actor-json');
		expect(env.FROM_DOTENV).toBeNull();
	});

	it('applies shell < CLI-set vars < environmentVariables < .env', async () => {
		for (const name of ['FROM_SHELL', 'CRAWLEE_PURGE_ON_START', 'FROM_ACTOR_JSON', 'FROM_DOTENV']) {
			vitest.stubEnv(name, 'shell');
		}
		setEnvironmentVariables({ FROM_ACTOR_JSON: 'actor-json', FROM_DOTENV: 'actor-json' });
		writeFileSync(joinPath('.env'), 'FROM_DOTENV=dotenv\n');

		const env = await runAndReadEnv();

		expect(env.FROM_SHELL).toBe('shell');
		expect(env.CRAWLEE_PURGE_ON_START).toMatch(/^[01]$/);
		expect(env.FROM_ACTOR_JSON).toBe('actor-json');
		expect(env.FROM_DOTENV).toBe('dotenv');
	});

	it('lets environmentVariables override a CLI-set var', async () => {
		setEnvironmentVariables({ CRAWLEE_PURGE_ON_START: 'actor-json' });

		expect((await runAndReadEnv()).CRAWLEE_PURGE_ON_START).toBe('actor-json');
	});

	it('lets .env override a CLI-set var and environmentVariables', async () => {
		setEnvironmentVariables({ CRAWLEE_PURGE_ON_START: 'actor-json' });
		writeFileSync(joinPath('.env'), 'CRAWLEE_PURGE_ON_START=dotenv\n');

		expect((await runAndReadEnv()).CRAWLEE_PURGE_ON_START).toBe('dotenv');
	});

	it('passes @secret references in .env literally', async () => {
		writeFileSync(joinPath('.env'), 'SECRET_REF=@foo\n');

		expect((await runAndReadEnv()).SECRET_REF).toBe('@foo');
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
			expect(logMessages.error.join('\n')).toContain(`Couldn't read ${joinPath('.env')}`);
			expect(existsSync(resultPath)).toBe(false);
			expect(existsSync(datasetItem)).toBe(true);
		},
	);
});
