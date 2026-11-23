import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { ActorSourceType } from 'apify-client';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { testUserClient } from '../../__setup__/config.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useUniqueId } from '../../__setup__/hooks/useUniqueId.js';

// The non-interactive path: without --yes the prompt can't show and the command must fail.
vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	isCI: true,
}));

const SECRET_VALUE = 's3cr3t-sentinel';
const NEW_SECRET_VALUE = 'n3w-s3cr3t-sentinel';

useAuthSetup({ perTest: false });

const { logMessages } = useConsoleSpy();

const { EnvPushCommand } = await import('../../../src/commands/env/push.js');

describe('[api] apify env push', () => {
	let actorId: string;
	let dotEnvDir: string;
	let originalExitCode: typeof process.exitCode;

	const platformEnvVars = async () => {
		const { items } = await testUserClient.actor(actorId).version('0.0').envVars().list();
		return Object.fromEntries(items.map(({ name, value, isSecret }) => [name, { value, isSecret }]));
	};
	const writeDotEnv = (content: string) => writeFileSync(join(dotEnvDir, '.env'), content);
	const push = async (flags: Record<string, unknown> = {}) =>
		testRunCommand(EnvPushCommand, { flags_actor: actorId, flags_dir: dotEnvDir, ...flags });

	beforeAll(async () => {
		await safeLogin();

		const actor = await testUserClient.actors().create({
			name: useUniqueId('cli-env-push'),
			isPublic: false,
			versions: [
				{
					versionNumber: '0.0',
					sourceType: ActorSourceType.SourceFiles,
					buildTag: 'latest',
					sourceFiles: [],
					envVars: [
						{ name: 'SAME', value: 'same-value', isSecret: false },
						{ name: 'CHANGED', value: 'old-value', isSecret: false },
						{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
						{ name: 'OLD_VAR', value: 'old', isSecret: false },
					],
				},
			],
		});
		actorId = actor.id;
		dotEnvDir = mkdtempSync(join(tmpdir(), 'env-push-api-'));
	}, TEST_TIMEOUT);

	afterAll(async () => {
		if (actorId) {
			await testUserClient.actor(actorId).delete();
		}
		rmSync(dotEnvDir, { recursive: true, force: true });
	}, TEST_TIMEOUT);

	beforeEach(() => {
		originalExitCode = process.exitCode;
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it(
		'fails without --yes when there is no terminal and changes nothing',
		async () => {
			const before = await platformEnvVars();
			writeDotEnv(`NEW_VAR=${NEW_SECRET_VALUE}\n`);

			await push({ flags_prune: true });

			expect(process.exitCode).toBe(1);
			expect(logMessages.error.join('\n')).toContain('To push without a prompt, pass --yes.');
			expect(await platformEnvVars()).toEqual(before);
		},
		TEST_TIMEOUT,
	);

	it(
		'adds and updates, skips empty values, and keeps variables only on the platform',
		async () => {
			writeDotEnv(`SAME=same-value\nCHANGED=new-value\nAPI_KEY=\nNEW_VAR=${NEW_SECRET_VALUE}\n`);

			const instance = await push({ flags_yes: true, flags_json: true });

			expect(process.exitCode).toBeFalsy();
			const output = JSON.parse(logMessages.log.join('\n'));
			expect(output).toMatchObject({ ok: true, operation: 'env-push', confirmed: true });
			expect(output.changes).toEqual([
				{ name: 'API_KEY', action: 'skip-empty', isSecret: true },
				{ name: 'CHANGED', action: 'update', isSecret: false, result: 'done' },
				{ name: 'NEW_VAR', action: 'add', isSecret: true, result: 'done' },
				{ name: 'OLD_VAR', action: 'keep', isSecret: false },
				{ name: 'SAME', action: 'unchanged', isSecret: false },
			]);

			const envVars = await platformEnvVars();
			expect(envVars.CHANGED).toEqual({ value: 'new-value', isSecret: false });
			expect(envVars.NEW_VAR).toMatchObject({ isSecret: true });
			expect(envVars.API_KEY).toMatchObject({ isSecret: true });
			expect(envVars.OLD_VAR).toEqual({ value: 'old', isSecret: false });
			expect(envVars.SAME).toEqual({ value: 'same-value', isSecret: false });

			for (const value of [SECRET_VALUE, NEW_SECRET_VALUE]) {
				expect(logMessages.log.join('\n')).not.toContain(value);
				expect(logMessages.error.join('\n')).not.toContain(value);
				expect(JSON.stringify((instance as unknown as Record<string, unknown>).telemetryData)).not.toContain(value);
			}
		},
		TEST_TIMEOUT,
	);

	it(
		'deletes the variables that are not in .env with --prune',
		async () => {
			writeDotEnv(`SAME=same-value\nAPI_KEY=\nNEW_VAR=${NEW_SECRET_VALUE}\n`);

			await push({ flags_yes: true, flags_prune: true });

			expect(process.exitCode).toBeFalsy();
			expect(Object.keys(await platformEnvVars()).sort()).toEqual(['API_KEY', 'NEW_VAR', 'SAME']);
		},
		TEST_TIMEOUT,
	);
});
