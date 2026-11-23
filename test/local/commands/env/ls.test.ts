import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvLsCommand } from '../../../../src/commands/env/ls.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
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

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

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
					{ name: 'LOG_LEVEL', value: 'debug', isSecret: false },
					{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
				],
			},
			{ versionNumber: '1.0', envVars: [] },
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-ls-test-'));
	mkdirSync(join(actorDir, '.actor'));
	writeFileSync(join(actorDir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name: 'my-actor' }));
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

const expectNoSecretValue = (instance: unknown) => {
	expect(logMessages.log.join('\n')).not.toContain(SECRET_VALUE);
	expect(logMessages.error.join('\n')).not.toContain(SECRET_VALUE);
	expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(SECRET_VALUE);
};

describe('apify env ls', () => {
	it('prints a table with plain values and hides secrets', async () => {
		const instance = await testRunCommand(EnvLsCommand, { flags_dir: actorDir });

		const output = logMessages.log.join('\n');
		expect(output).toMatch(/LOG_LEVEL.*plain.*debug/);
		expect(output).toMatch(/API_KEY.*secret.*hidden/);
		expect(output.indexOf('LOG_LEVEL')).toBeLessThan(output.indexOf('API_KEY'));
		expect(process.exitCode).toBeUndefined();
		expectNoSecretValue(instance);
	});

	it('names the Actor and version on stderr, so stdout holds only the table', async () => {
		await testRunCommand(EnvLsCommand, { flags_dir: actorDir });

		expect(logMessages.error.join('\n')).toContain('Env vars on tester/my-actor version 0.0:');
		expect(logMessages.log.join('\n')).not.toContain('Env vars on');
	});

	it('prints JSON with --json', async () => {
		const instance = await testRunCommand(EnvLsCommand, { flags_dir: actorDir, flags_json: true });

		expect(JSON.parse(logMessages.log.join('\n'))).toEqual({
			ok: true,
			operation: 'env-ls',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			envVars: [
				{ name: 'LOG_LEVEL', isSecret: false, value: 'debug' },
				{ name: 'API_KEY', isSecret: true },
			],
		});
		expectNoSecretValue(instance);
	});

	it('says when the version has no env vars', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'tester/my-actor', flags_version: '1.0' });

		expect(logMessages.log.join('\n')).toContain('No env vars on tester/my-actor version 1.0.');
	});

	it('prints an empty list with --json', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'actor-1', flags_version: '1.0', flags_json: true });

		expect(JSON.parse(logMessages.log.join('\n'))).toMatchObject({ ok: true, version: '1.0', envVars: [] });
	});

	it('fails with exit code 250 when the version does not exist', async () => {
		await testRunCommand(EnvLsCommand, { flags_dir: actorDir, flags_version: '9.9', flags_json: true });

		expect(process.exitCode).toBe(250);
		expect(logMessages.log).toEqual([]);
		expect(logMessages.error.join('\n')).toContain("Version 9.9 doesn't exist on Actor tester/my-actor.");
	});

	it('fails with exit code 250 when the Actor does not exist', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'nobody/nothing' });

		expect(process.exitCode).toBe(250);
		expect(logMessages.error.join('\n')).toContain(`Actor "nobody/nothing" doesn't exist`);
	});
});
