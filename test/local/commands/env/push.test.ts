import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvPushCommand } from '../../../../src/commands/env/push.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	isCI: true,
}));

// Runs the real prompt wrapper by default; a test answers the prompt with `mockResolvedValueOnce`.
const yesNoConfirm = vitest.hoisted(() => vitest.fn());
vitest.mock('../../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('../../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js')>();
	yesNoConfirm.mockImplementation(original.useYesNoConfirm);
	return { useYesNoConfirm: yesNoConfirm };
});

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
const NEW_SECRET_VALUE = 'n3w-s3cr3t-sentinel';
const PLAIN_VALUE = 'pl41n-sentinel';

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

const envVarsOnPlatform = () => envPlatform.state.actors[0].versions[0].envVars;
const envVarOnPlatform = (name: string) => envVarsOnPlatform().find((envVar) => envVar.name === name);
const writeDotEnv = (content: string) => writeFileSync(join(actorDir, '.env'), content);
const stdout = () => logMessages.log.join('\n');
const stderr = () => logMessages.error.join('\n');

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	resetCwdCaches();
	yesNoConfirm.mockClear();
	envPlatform.reset();
	envPlatform.state.actors.push({
		id: 'actor-1',
		username: 'tester',
		name: 'my-actor',
		versions: [
			{
				versionNumber: '0.0',
				envVars: [
					{ name: 'SAME', value: 'same-value', isSecret: false },
					{ name: 'CHANGED', value: 'old-value', isSecret: false },
					{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
					{ name: 'OLD_VAR', value: 'old', isSecret: false },
				],
			},
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-push-test-'));
	mkdirSync(join(actorDir, '.actor'));
	writeFileSync(join(actorDir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name: 'my-actor' }));
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

const expectNoValues = (instance: unknown) => {
	for (const value of [SECRET_VALUE, NEW_SECRET_VALUE, PLAIN_VALUE]) {
		expect(stdout()).not.toContain(value);
		expect(stderr()).not.toContain(value);
		expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(value);
	}
};

describe('apify env push', () => {
	it('adds, updates, and replaces with --yes, and keeps variables only on the platform', async () => {
		writeDotEnv(`SAME=same-value\nCHANGED=${PLAIN_VALUE}\nAPI_KEY=${NEW_SECRET_VALUE}\nNEW_VAR=${NEW_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(envPlatform.writes).toEqual([
			{ method: 'create', actorId: 'actor-1', version: '0.0', name: 'NEW_VAR' },
			{ method: 'update', actorId: 'actor-1', version: '0.0', name: 'API_KEY' },
			{ method: 'update', actorId: 'actor-1', version: '0.0', name: 'CHANGED' },
		]);
		expect(envVarOnPlatform('NEW_VAR')).toEqual({ name: 'NEW_VAR', value: NEW_SECRET_VALUE, isSecret: true });
		expect(envVarOnPlatform('API_KEY')).toEqual({ name: 'API_KEY', value: NEW_SECRET_VALUE, isSecret: true });
		expect(envVarOnPlatform('CHANGED')).toEqual({ name: 'CHANGED', value: PLAIN_VALUE, isSecret: false });
		expect(envVarOnPlatform('OLD_VAR')).toBeDefined();

		expect(stdout()).toContain('Changes to tester/my-actor version 0.0:');
		expect(stdout()).toContain('+ NEW_VAR (secret)');
		expect(stdout()).toContain('~ CHANGED');
		expect(stdout()).toContain("~ API_KEY (secret, replaced: secret values can't be compared)");
		expect(stdout()).toContain('Unchanged: SAME');
		expect(stdout()).toContain('Only on the platform, kept: OLD_VAR. Pass --prune to delete.');
		expect(stdout()).toContain('Added NEW_VAR (secret)');
		expect(stdout()).toContain('Updated CHANGED');
		expect(stdout()).toContain('Replaced API_KEY (secret)');
		expect(stdout()).toContain('Pushed 3 of 3 changes.');
		expect(stderr()).toContain('Rebuild the Actor before runs see the change');
		expectNoValues(instance);
	});

	it('creates new variables as plain with --plain and keeps the type of existing ones', async () => {
		writeDotEnv(`NEW_VAR=${PLAIN_VALUE}\nAPI_KEY=${NEW_SECRET_VALUE}\nCHANGED=x\n`);

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true, flags_plain: true });

		expect(envVarOnPlatform('NEW_VAR')).toMatchObject({ isSecret: false });
		expect(envVarOnPlatform('API_KEY')).toMatchObject({ isSecret: true });
		expect(envVarOnPlatform('CHANGED')).toMatchObject({ isSecret: false });
	});

	it('deletes variables that are not in .env with --prune, after the other writes', async () => {
		writeDotEnv('SAME=same-value\nNEW_VAR=new\n');

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true, flags_prune: true });

		expect(envPlatform.writes.map(({ method, name }) => `${method} ${name}`)).toEqual([
			'create NEW_VAR',
			'delete API_KEY',
			'delete CHANGED',
			'delete OLD_VAR',
		]);
		expect(envVarsOnPlatform().map(({ name }) => name)).toEqual(['SAME', 'NEW_VAR']);
		expect(stdout()).toContain('- API_KEY (secret)');
		expect(stdout()).toContain('- OLD_VAR');
		expect(stdout()).toContain('Deleted OLD_VAR');
	});

	it('skips keys with an empty value and leaves an empty secret from apify env pull untouched', async () => {
		writeDotEnv('API_KEY=\nCHANGED=\nEMPTY_NEW=\nSAME=same-value\n');

		const instance = await testRunCommand(EnvPushCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
		});

		expect(envPlatform.writes).toEqual([]);
		expect(envVarOnPlatform('API_KEY')).toEqual({ name: 'API_KEY', value: SECRET_VALUE, isSecret: true });
		expect(envVarOnPlatform('CHANGED')).toMatchObject({ value: 'old-value' });
		expect(stderr()).toContain('Nothing to push.');

		const output = JSON.parse(stdout());
		expect(output).toEqual({
			ok: true,
			operation: 'env-push',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			prune: false,
			confirmed: false,
			changes: [
				{ name: 'API_KEY', action: 'skip-empty', isSecret: true },
				{ name: 'CHANGED', action: 'skip-empty', isSecret: false },
				{ name: 'EMPTY_NEW', action: 'skip-empty', isSecret: true },
				{ name: 'OLD_VAR', action: 'keep', isSecret: false },
				{ name: 'SAME', action: 'unchanged', isSecret: false },
			],
		});
		expectNoValues(instance);
	});

	it('reports skipped empty keys in the plan', async () => {
		writeDotEnv('API_KEY=\nNEW_VAR=x\n');

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

		expect(stdout()).toContain('Skipped, empty in .env: API_KEY');
		expect(envPlatform.writes.map(({ name }) => name)).toEqual(['NEW_VAR']);
	});

	it('prints the plan and "Nothing to push." when nothing changes', async () => {
		writeDotEnv('SAME=same-value\n');

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir });

		expect(stdout()).toContain('No changes to tester/my-actor version 0.0.');
		expect(stdout()).toContain('Unchanged: SAME');
		expect(stderr()).toContain('Nothing to push.');
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it('refuses --prune when .env defines no variables', async () => {
		writeDotEnv('# nothing here\n');

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true, flags_prune: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain('The .env file defines no variables, so --prune would delete every variable.');
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails with exit code 5 without a .env file', async () => {
		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`No .env file in ${actorDir}.`);
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails without --yes when there is no terminal, and writes nothing', async () => {
		writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_prune: true });

		expect(process.exitCode).toBe(1);
		expect(stderr()).toContain('To push without a prompt, pass --yes.');
		expect(envPlatform.writes).toEqual([]);
		expectNoValues(instance);
	});

	it('asks before pushing and pushes nothing when declined', async () => {
		writeDotEnv('NEW_VAR=x\n');
		yesNoConfirm.mockResolvedValueOnce(false);

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir });

		expect(yesNoConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Push these changes to tester/my-actor version 0.0?', default: false }),
		);
		expect(envPlatform.writes).toEqual([]);
		expect(stderr()).toContain('Nothing was pushed.');
		expect(process.exitCode).toBeUndefined();
	});

	it('pushes after a confirmed prompt', async () => {
		writeDotEnv('NEW_VAR=x\n');
		yesNoConfirm.mockResolvedValueOnce(true);

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir });

		expect(envPlatform.writes.map(({ name }) => name)).toEqual(['NEW_VAR']);
	});

	it('continues after a failed variable, reports it, and exits with 1', async () => {
		writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\nCHANGED=${PLAIN_VALUE}\nAPI_KEY=${NEW_SECRET_VALUE}\n`);
		envPlatform.failNext('update', 'API_KEY', new Error('Concurrent update'));

		const instance = await testRunCommand(EnvPushCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
		});

		expect(process.exitCode).toBe(1);
		expect(envPlatform.writes.map(({ name }) => name)).toEqual(['NEW_VAR', 'CHANGED']);
		expect(envVarOnPlatform('API_KEY')).toMatchObject({ value: SECRET_VALUE });
		expect(stderr()).toContain("Couldn't replace API_KEY: Concurrent update");
		expect(stderr()).toContain('Pushed 2 of 3 changes.');
		expect(stderr()).toContain('Rebuild the Actor before runs see the change');

		const output = JSON.parse(stdout());
		expect(output).toMatchObject({ ok: false, operation: 'env-push', prune: false, confirmed: true });
		expect(output.changes).toEqual([
			{ name: 'API_KEY', action: 'replace-secret', isSecret: true, result: 'failed', error: 'Concurrent update' },
			{ name: 'CHANGED', action: 'update', isSecret: false, result: 'done' },
			{ name: 'NEW_VAR', action: 'add', isSecret: true, result: 'done' },
			{ name: 'OLD_VAR', action: 'keep', isSecret: false },
			{ name: 'SAME', action: 'keep', isSecret: false },
		]);
		expectNoValues(instance);
	});

	it('prints only the error message of a failed write, never the request body', async () => {
		writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\n`);
		const networkError = Object.assign(new Error('Network Error'), {
			config: { data: JSON.stringify({ name: 'NEW_VAR', value: NEW_SECRET_VALUE, isSecret: true }) },
		});
		envPlatform.failNext('create', 'NEW_VAR', networkError);

		const instance = await testRunCommand(EnvPushCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
		});

		expect(process.exitCode).toBe(1);
		expect(stderr()).toContain("Couldn't add NEW_VAR: Network Error");
		expect(JSON.parse(stdout()).changes).toContainEqual({
			name: 'NEW_VAR',
			action: 'add',
			isSecret: true,
			result: 'failed',
			error: 'Network Error',
		});
		expect(stderr()).not.toContain('Rebuild the Actor');
		expectNoValues(instance);
	});

	it('prints the plan to stderr and only JSON on stdout with --json and a prompt', async () => {
		writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\n`);
		yesNoConfirm.mockResolvedValueOnce(false);

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_json: true });

		expect(stderr()).toContain('+ NEW_VAR (secret)');
		expect(stderr()).toContain('Nothing was pushed.');
		expect(JSON.parse(stdout())).toMatchObject({ ok: true, confirmed: false });
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails on a value that is too long before any write, without printing it', async () => {
		writeDotEnv(`NEW_VAR=x\nLONG=${NEW_SECRET_VALUE.repeat(3000)}\n`);

		const instance = await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain('The value of LONG is longer than 50000 characters.');
		expect(envPlatform.writes).toEqual([]);
		expectNoValues(instance);
	});

	it('prints only JSON on stdout with --json and --yes', async () => {
		writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\n`);

		const instance = await testRunCommand(EnvPushCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
			flags_prune: true,
		});

		const output = JSON.parse(stdout());
		expect(output).toMatchObject({ ok: true, prune: true, confirmed: true });
		expect(output.changes).toContainEqual({ name: 'OLD_VAR', action: 'remove', isSecret: false, result: 'done' });
		expect(stderr()).toContain('Pushed 5 of 5 changes.');
		expect(stderr()).not.toContain('Changes to');
		expectNoValues(instance);
	});

	it('fails on malformed .env lines before any write and names them only by number', async () => {
		writeDotEnv(`NEW_VAR=x\nNO_EQUALS_SIGN\nBAD-NAME=${PLAIN_VALUE}\n`);

		const instance = await testRunCommand(EnvPushCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
		});

		expect(process.exitCode).toBe(5);
		expect(envPlatform.writes).toEqual([]);
		expect(stdout()).toBe('');
		expect(stderr()).toContain(`Can't push ${join(actorDir, '.env')}: lines 2, 3 are malformed.`);
		expect(stderr()).not.toMatch(/NO_EQUALS_SIGN|BAD-NAME/);
		expectNoValues(instance);
	});

	// Secret material from unquoted multi-line values and a stray line: no part of them may be pushed or printed.
	const PEM_TAIL = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7secretmaterialQ';
	const MALFORMED_DOTENVS = {
		'an unquoted PEM key': {
			content: `PLAIN=${PLAIN_VALUE}\nKEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgk+qhkiG9w0BAQEFAA/SCBKcwggSjAgEA\n${PEM_TAIL}==\n-----END PRIVATE KEY-----\n`,
			lines: 'lines 3, 5 are',
			material: [PEM_TAIL, 'MIIEvQIBADANBgk', 'BEGIN PRIVATE KEY'],
		},
		'an unquoted service account JSON': {
			content: `PLAIN=${PLAIN_VALUE}\nGOOGLE_CREDENTIALS={\n  "type": "service_account",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\nsa-key-material==\\n-----END PRIVATE KEY-----\\n",\n}\n`,
			lines: 'lines 3, 4, 5 are',
			material: ['sa-key-material', 'private_key', 'GOOGLE_CREDENTIALS'],
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
	)(
		'fails without pushing or printing any part of $name (--json: $json)',
		async ({ content, lines, material, json }) => {
			writeDotEnv(content);

			const instance = await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true, flags_json: json });

			expect(process.exitCode).toBe(5);
			expect(envPlatform.writes).toEqual([]);
			expect(stdout()).toBe('');
			expect(stderr()).toContain(`Can't push ${join(actorDir, '.env')}: ${lines} malformed.`);
			for (const text of material) {
				expect(stderr()).not.toContain(text);
				expect(JSON.stringify((instance as unknown as Record<string, unknown>).telemetryData)).not.toContain(text);
			}
			expectNoValues(instance);
		},
	);

	describe("with platform names that .env can't hold", () => {
		beforeEach(() => {
			envVarsOnPlatform().push(
				{ name: 'DATABASE-URL', value: SECRET_VALUE, isSecret: true },
				{ name: 'CLEAR\u001b[2J', value: 'x', isSecret: false },
			);
		});

		it('keeps them with --prune and names them in a warning with control characters escaped', async () => {
			writeDotEnv('SAME=same-value\n');

			const instance = await testRunCommand(EnvPushCommand, {
				flags_dir: actorDir,
				flags_yes: true,
				flags_prune: true,
			});

			expect(process.exitCode).toBeUndefined();
			expect(envPlatform.writes.map(({ method, name }) => `${method} ${name}`)).toEqual([
				'delete API_KEY',
				'delete CHANGED',
				'delete OLD_VAR',
			]);
			expect(envVarOnPlatform('DATABASE-URL')).toEqual({ name: 'DATABASE-URL', value: SECRET_VALUE, isSecret: true });
			expect(envVarOnPlatform('CLEAR\u001b[2J')).toBeDefined();
			expect(stderr()).toContain(
				"Skipped DATABASE-URL, CLEAR\\x1b[2J: a name in .env can only have letters, digits, and underscores, and can't start with a digit.",
			);
			expect(stdout()).not.toMatch(/DATABASE-URL|CLEAR/);
			expect(`${stdout()}\n${stderr()}`).not.toContain('\u001b[2J');
			expectNoValues(instance);
		});

		it('leaves them out of the --json changes', async () => {
			writeDotEnv('SAME=same-value\n');

			await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true, flags_json: true });

			expect(JSON.parse(stdout()).changes.map(({ name }: { name: string }) => name)).toEqual([
				'API_KEY',
				'CHANGED',
				'OLD_VAR',
				'SAME',
			]);
			expect(envPlatform.writes).toEqual([]);
		});

		it('escapes a newline in a skipped name, so the warning stays on one line', async () => {
			envVarsOnPlatform().push({ name: 'X\n✔ Pushed 0 of 0 changes. Y', value: 'x', isSecret: false });
			writeDotEnv('SAME=same-value\n');

			await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

			expect(stderr()).toContain('Skipped DATABASE-URL, CLEAR\\x1b[2J, X\\x0a✔ Pushed 0 of 0 changes. Y: a name');
			expect(`${stdout()}\n${stderr()}`).not.toContain('\n✔ Pushed 0 of 0 changes. Y');
		});
	});

	it('fails on a name that is too long before any write', async () => {
		writeDotEnv(`${'A'.repeat(101)}=x\nNEW_VAR=x\n`);

		await testRunCommand(EnvPushCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(envPlatform.writes).toEqual([]);
	});
});
