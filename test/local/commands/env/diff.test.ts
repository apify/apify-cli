import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvDiffCommand } from '../../../../src/commands/env/diff.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');
	return {
		...(await importOriginal<typeof import('../../../../src/lib/utils.js')>()),
		getLoggedClientOrThrow: vitest.fn(async () => envPlatform.client),
		getCurrentUserInfo: vitest.fn(async () => envPlatform.state.user),
	};
});

const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');

const SECRET_VALUE = 's3cr3t-sentinel';
const LOCAL_SECRET_VALUE = 'l0cal-s3cr3t-sentinel';
const PLAIN_VALUE = 'pl41n-sentinel';
const LOCAL_PLAIN_VALUE = 'l0cal-pl41n-sentinel';

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

const writeDotEnv = (content: string) => writeFileSync(join(actorDir, '.env'), content);
const stdout = () => logMessages.log.join('\n');
const stderr = () => logMessages.error.join('\n');

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	resetCwdCaches();
	envPlatform.reset();
	envPlatform.state.actors.push({
		id: 'actor-1',
		username: 'tester',
		name: 'my-actor',
		versions: [
			{
				versionNumber: '0.0',
				envVars: [
					{ name: 'PLAIN', value: PLAIN_VALUE, isSecret: false },
					{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
				],
			},
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-diff-test-'));
	mkdirSync(join(actorDir, '.actor'));
	writeFileSync(join(actorDir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name: 'my-actor' }));
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

const expectNoValues = (instance: unknown) => {
	for (const value of [SECRET_VALUE, LOCAL_SECRET_VALUE, PLAIN_VALUE, LOCAL_PLAIN_VALUE]) {
		expect(stdout()).not.toContain(value);
		expect(stderr()).not.toContain(value);
		expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(value);
	}
};

describe('apify env diff', () => {
	it('is in sync with a matching plain value and a secret matched by name, and exits with 0', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain('.env and tester/my-actor version 0.0 are in sync.');
		expect(stdout()).not.toContain('Only');
		expectNoValues(instance);
	});

	it('treats an empty local secret as in sync', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=\n`);

		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain('are in sync.');
	});

	it('lists names only in .env and exits with 1', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=x\nNEW_B=${LOCAL_PLAIN_VALUE}\nNEW_A=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('.env and tester/my-actor version 0.0 differ:');
		expect(stdout()).toContain('Only in .env: NEW_A, NEW_B');
		expect(stdout()).not.toContain('Only on the platform');
		expect(stdout()).not.toContain('Different values');
		expectNoValues(instance);
	});

	it('lists names only on the platform and exits with 1', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('Only on the platform: API_KEY');
		expect(stdout()).not.toContain('Only in .env');
		expect(stdout()).not.toContain('Different values');
		expectNoValues(instance);
	});

	it('lists plain variables whose values differ and exits with 1', async () => {
		writeDotEnv(`PLAIN=${LOCAL_PLAIN_VALUE}\nAPI_KEY=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('Different values: PLAIN');
		expect(stdout()).not.toContain('Only');
		expectNoValues(instance);
	});

	it('prints every kind of difference as JSON without values', async () => {
		writeDotEnv(`PLAIN=${LOCAL_PLAIN_VALUE}\nNEW_VAR=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_json: true });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(JSON.parse(stdout())).toEqual({
			ok: true,
			operation: 'env-diff',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			inSync: false,
			onlyInDotEnv: ['NEW_VAR'],
			onlyOnPlatform: ['API_KEY'],
			valuesDiffer: ['PLAIN'],
		});
		expectNoValues(instance);
	});

	it('prints an in-sync result as JSON and exits with 0', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=\n`);

		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(JSON.parse(stdout())).toMatchObject({
			ok: true,
			operation: 'env-diff',
			inSync: true,
			onlyInDotEnv: [],
			onlyOnPlatform: [],
			valuesDiffer: [],
		});
	});

	it('fails with exit code 5 when there is no .env file', async () => {
		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`No .env file in ${actorDir}.`);
		expect(stdout()).toBe('');
	});
});
