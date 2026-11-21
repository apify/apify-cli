import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
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

useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');

const KEYS = [
	'FROM_DOTENV',
	'SHELL_VS_DOTENV',
	'ACTOR_JSON_VS_DOTENV',
	'ONLY_ACTOR_JSON',
	'SECRET_REF',
	'EMPTY',
	'ACTOR_INPUT_KEY',
];

describe('apify run with .env', () => {
	let outputPath: string;
	let actorJson: Record<string, unknown>;

	const runAndReadEnv = async () => {
		rmSync(outputPath, { force: true });
		await testRunCommand(RunCommand, {});
		return JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, string | undefined>;
	};

	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();

		outputPath = joinPath('env-output.json');
		const picked = KEYS.map((key) => `${JSON.stringify(key)}: process.env[${JSON.stringify(key)}]`).join(', ');
		writeFileSync(
			joinPath('src/main.js'),
			`
import { writeFileSync } from 'node:fs';
writeFileSync(String.raw\`${outputPath}\`, JSON.stringify({ ${picked} }));
`,
		);

		actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
	}, TEST_TIMEOUT);

	afterAll(async () => {
		delete process.env.SHELL_VS_DOTENV;
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
		rmSync(joinPath('.env'), { force: true });
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'));
	});

	it('runs as before without .env', async () => {
		const env = await runAndReadEnv();

		expect(env.FROM_DOTENV).toBeUndefined();
		expect(env.ACTOR_INPUT_KEY).toBeTruthy();
	});

	it('passes .env values to the Actor, literally', async () => {
		writeFileSync(joinPath('.env'), 'FROM_DOTENV=yes\nSECRET_REF=@mySecret\nEMPTY=\n');

		const env = await runAndReadEnv();

		expect(env.FROM_DOTENV).toBe('yes');
		expect(env.SECRET_REF).toBe('@mySecret');
		expect(env.EMPTY).toBe('');
	});

	it('lets .env win over the shell and actor.json', async () => {
		process.env.SHELL_VS_DOTENV = 'shell';
		writeFileSync(
			joinPath(LOCAL_CONFIG_PATH),
			JSON.stringify(
				{
					...actorJson,
					environmentVariables: { ACTOR_JSON_VS_DOTENV: 'actor-json', ONLY_ACTOR_JSON: 'kept' },
				},
				null,
				'\t',
			),
		);
		writeFileSync(joinPath('.env'), 'SHELL_VS_DOTENV=dotenv\nACTOR_JSON_VS_DOTENV=dotenv\n');

		const env = await runAndReadEnv();

		expect(env.SHELL_VS_DOTENV).toBe('dotenv');
		expect(env.ACTOR_JSON_VS_DOTENV).toBe('dotenv');
		expect(env.ONLY_ACTOR_JSON).toBe('kept');
	});
});
