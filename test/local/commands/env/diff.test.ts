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

const writeDotEnv = (content: string, dir = actorDir) => writeFileSync(join(dir, '.env'), content);
const writeActorJson = (dir: string, actorJson: Record<string, unknown>) => {
	mkdirSync(join(dir, '.actor'), { recursive: true });
	writeFileSync(join(dir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, ...actorJson }));
};
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
			{ versionNumber: '0.1', envVars: [{ name: 'V01_ONLY', value: 'v01', isSecret: false }] },
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-diff-test-'));
	writeActorJson(actorDir, { name: 'my-actor' });
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
		expect(stdout()).toContain('  Only in .env:\n    + NEW_A\n    + NEW_B');
		expect(stdout()).not.toContain('Only on the platform');
		expect(stdout()).not.toContain('Different values');
		expectNoValues(instance);
	});

	it('lists names only on the platform and exits with 1', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('  Only on the platform:\n    - API_KEY');
		expect(stdout()).not.toContain('Only in .env');
		expect(stdout()).not.toContain('Different values');
		expectNoValues(instance);
	});

	it('lists plain variables whose values differ and exits with 1', async () => {
		writeDotEnv(`PLAIN=${LOCAL_PLAIN_VALUE}\nAPI_KEY=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('  Different values:\n    ~ PLAIN');
		expect(stdout()).not.toContain('Only');
		expectNoValues(instance);
	});

	it('lists every kind of difference with one name per line', async () => {
		writeDotEnv(`PLAIN=${LOCAL_PLAIN_VALUE}\nNEW_VAR=${LOCAL_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toBe(
			[
				'.env and tester/my-actor version 0.0 differ:',
				'  Only in .env:',
				'    + NEW_VAR',
				'  Only on the platform:',
				'    - API_KEY',
				'  Different values:',
				'    ~ PLAIN',
			].join('\n'),
		);
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

	describe("with platform names that .env can't hold", () => {
		beforeEach(() => {
			envPlatform.state.actors[0].versions[0].envVars.push(
				{ name: 'DATABASE-URL', value: SECRET_VALUE, isSecret: true },
				{ name: 'CLEAR\u001b[2J', value: 'x', isSecret: false },
			);
			writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=\n`);
		});

		it('is in sync when they are the only difference, and names them in a warning with control characters escaped', async () => {
			const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

			expect(process.exitCode).toBeUndefined();
			expect(stdout()).toContain('.env and tester/my-actor version 0.0 are in sync.');
			expect(stderr()).toContain(
				"Skipped DATABASE-URL, CLEAR\\x1b[2J: a name in .env can only have letters, digits, and underscores, and can't start with a digit.",
			);
			expect(`${stdout()}\n${stderr()}`).not.toContain('\u001b[2J');
			expectNoValues(instance);
		});

		it('leaves them out of onlyOnPlatform in --json', async () => {
			await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_json: true });

			expect(process.exitCode).toBeUndefined();
			expect(JSON.parse(stdout())).toMatchObject({ inSync: true, onlyOnPlatform: [] });
		});

		it('escapes a newline in a skipped name, so the warning stays on one line', async () => {
			envPlatform.state.actors[0].versions[0].envVars.push({
				name: 'X\n✔ Pushed 0 of 0 changes. Y',
				value: 'x',
				isSecret: false,
			});

			await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

			expect(process.exitCode).toBeUndefined();
			expect(stderr()).toContain('Skipped DATABASE-URL, CLEAR\\x1b[2J, X\\x0a✔ Pushed 0 of 0 changes. Y: a name');
			expect(`${stdout()}\n${stderr()}`).not.toContain('\n✔ Pushed 0 of 0 changes. Y');
		});

		it("is in sync with a platform var named __proto__, which .env can't hold", async () => {
			envPlatform.state.actors[0].versions[0].envVars.push({ name: '__proto__', value: SECRET_VALUE, isSecret: true });

			await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_json: true });

			expect(process.exitCode).toBeUndefined();
			expect(JSON.parse(stdout())).toMatchObject({ inSync: true, onlyOnPlatform: [] });
			expect(stderr()).toContain('Skipped DATABASE-URL, CLEAR\\x1b[2J, __proto__: a name');
		});

		it('stops on a __proto__ line in .env', async () => {
			writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=\n__proto__=proto-value\n`);

			await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

			expect(process.exitCode).toBe(5);
			expect(stderr()).toContain('line 3 is malformed');
			expect(`${stdout()}\n${stderr()}`).not.toContain('proto-value');
		});
	});

	it('compares the version from actor.json', async () => {
		writeActorJson(actorDir, { name: 'my-actor', version: '0.1' });
		writeDotEnv('V01_ONLY=v01\n');

		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toBe('Success: .env and tester/my-actor version 0.1 are in sync.');
	});

	it('compares the version from --version', async () => {
		writeDotEnv('V01_ONLY=v01\n');

		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_version: '0.1' });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toBe('Success: .env and tester/my-actor version 0.1 are in sync.');
	});

	it('reads .env from --dir with --actor and ignores the actor.json there', async () => {
		const otherDir = join(actorDir, 'other');
		writeActorJson(otherDir, { name: 'another-actor', version: '0.0' });
		writeDotEnv('V01_ONLY=v01\n', otherDir);
		writeDotEnv('NOT_READ=1\n');
		vitest.spyOn(process, 'cwd').mockReturnValue(actorDir);

		await testRunCommand(EnvDiffCommand, { flags_actor: 'tester/my-actor', flags_dir: otherDir, flags_version: '0.1' });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toBe('Success: .env and tester/my-actor version 0.1 are in sync.');
	});

	it('resolves a relative --dir against the current directory', async () => {
		const scraperDir = join(actorDir, 'actors', 'scraper');
		writeActorJson(scraperDir, { name: 'my-actor' });
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\nAPI_KEY=\nIN_DIR=1\n`, scraperDir);
		vitest.spyOn(process, 'cwd').mockReturnValue(actorDir);

		await testRunCommand(EnvDiffCommand, { flags_dir: join('actors', 'scraper') });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('  Only in .env:\n    + IN_DIR');
	});

	it('fails with exit code 250 when the version does not exist', async () => {
		writeDotEnv(`PLAIN=${PLAIN_VALUE}\n`);

		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_version: '0.9' });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(stderr()).toContain("Version 0.9 doesn't exist on Actor tester/my-actor. Its versions: 0.0, 0.1.");
		expect(stdout()).toBe('');
	});

	// Secret material from unquoted multi-line values and a stray line: the parts before '=' must never be printed.
	const PEM_TAIL = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7secretmaterialQ';
	const MALFORMED_DOTENVS = {
		'an unquoted PEM key': {
			content: `PLAIN=${PLAIN_VALUE}\nKEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgk+qhkiG9w0BAQEFAA/SCBKcwggSjAgEA\n${PEM_TAIL}==\n-----END PRIVATE KEY-----\n`,
			lines: 'lines 3, 5 are',
			material: [PEM_TAIL, 'MIIEvQIBADANBgk'],
		},
		'an unquoted service account JSON': {
			content: `PLAIN=${PLAIN_VALUE}\nGOOGLE_CREDENTIALS={\n  "type": "service_account",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\nsa-key-material==\\n-----END PRIVATE KEY-----\\n",\n}\n`,
			lines: 'lines 3, 4, 5 are',
			material: ['sa-key-material', 'private_key'],
		},
		'a stray connection string': {
			content: `PLAIN=${PLAIN_VALUE}\npostgres://admin:hunter2@db/app?sslmode=require\n`,
			lines: 'line 2 is',
			material: ['hunter2', 'postgres'],
		},
	};

	it.each(
		Object.entries(MALFORMED_DOTENVS).flatMap(([name, dotEnv]) => [
			{ name, json: false, ...dotEnv },
			{ name, json: true, ...dotEnv },
		]),
	)('fails without printing any part of $name (--json: $json)', async ({ content, lines, material, json }) => {
		writeDotEnv(content);

		const instance = await testRunCommand(EnvDiffCommand, { flags_dir: actorDir, flags_json: json });

		expect(process.exitCode).toBe(5);
		expect(stdout()).toBe('');
		expect(stderr()).toContain(`Can't compare ${join(actorDir, '.env')}: ${lines} malformed.`);
		for (const text of material) {
			expect(stderr()).not.toContain(text);
			expect(JSON.stringify((instance as unknown as Record<string, unknown>).telemetryData)).not.toContain(text);
		}
		expectNoValues(instance);
	});

	it('fails with exit code 5 when there is no .env file', async () => {
		await testRunCommand(EnvDiffCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`No .env file in ${actorDir}.`);
		expect(stdout()).toBe('');
	});
});
