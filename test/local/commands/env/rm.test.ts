import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvRmCommand } from '../../../../src/commands/env/rm.js';
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
const { getLoggedClientOrThrow } = await import('../../../../src/lib/utils.js');

const SECRET_VALUE = 's3cr3t-sentinel';

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

const envVarNames = () => envPlatform.state.actors[0].versions[0].envVars.map(({ name }) => name);

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	resetCwdCaches();
	yesNoConfirm.mockClear();
	vitest.mocked(getLoggedClientOrThrow).mockClear();
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
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-rm-test-'));
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

describe('apify env rm', () => {
	it('deletes a variable with --yes', async () => {
		const instance = await testRunCommand(EnvRmCommand, { args_name: 'API_KEY', flags_dir: actorDir, flags_yes: true });

		expect(envVarNames()).toEqual(['LOG_LEVEL']);
		expect(envPlatform.writes).toEqual([{ method: 'delete', actorId: 'actor-1', version: '0.0', name: 'API_KEY' }]);
		expect(logMessages.log.join('\n')).toContain('Deleted API_KEY from tester/my-actor version 0.0.');
		expect(logMessages.error.join('\n')).toContain(
			'Rebuild the Actor before runs see the change: apify builds create tester/my-actor --version 0.0',
		);
		expect(process.exitCode).toBeUndefined();
		expectNoSecretValue(instance);
	});

	it('deletes after a confirmed prompt', async () => {
		yesNoConfirm.mockResolvedValueOnce(true);

		await testRunCommand(EnvRmCommand, { args_name: 'LOG_LEVEL', flags_dir: actorDir });

		expect(yesNoConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Delete LOG_LEVEL from tester/my-actor version 0.0?', default: false }),
		);
		expect(envVarNames()).toEqual(['API_KEY']);
	});

	it('deletes nothing when the prompt is declined', async () => {
		yesNoConfirm.mockResolvedValueOnce(false);

		await testRunCommand(EnvRmCommand, { args_name: 'API_KEY', flags_dir: actorDir });

		expect(envPlatform.writes).toEqual([]);
		expect(logMessages.error.join('\n')).toContain('Nothing was deleted.');
		expect(logMessages.log).toEqual([]);
		expect(process.exitCode).toBeUndefined();
	});

	it('fails without --yes when there is no terminal', async () => {
		await testRunCommand(EnvRmCommand, { args_name: 'API_KEY', flags_dir: actorDir });

		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toContain(
			'apify env rm asks before it deletes anything. To delete without a prompt, pass --yes.',
		);
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails with exit code 250 when the variable does not exist', async () => {
		await testRunCommand(EnvRmCommand, { args_name: 'MISSING', flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(250);
		expect(logMessages.error.join('\n')).toContain("MISSING doesn't exist on tester/my-actor version 0.0.");
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails on an invalid name before any API call', async () => {
		await testRunCommand(EnvRmCommand, { args_name: 'A=B', flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
	});

	it('escapes control characters in the name it prints', async () => {
		envPlatform.state.actors[0].versions[0].envVars.push({ name: 'CLEAR\u001b[2J', value: 'x', isSecret: false });

		await testRunCommand(EnvRmCommand, { args_name: 'CLEAR\u001b[2J', flags_dir: actorDir, flags_yes: true });

		expect(envVarNames()).toEqual(['LOG_LEVEL', 'API_KEY']);
		expect(logMessages.log.join('\n')).toContain('Deleted CLEAR\\x1b[2J from tester/my-actor version 0.0.');
		expect(`${logMessages.log.join('\n')}\n${logMessages.error.join('\n')}`).not.toContain('\u001b[2J');
	});

	it('prints JSON', async () => {
		const instance = await testRunCommand(EnvRmCommand, {
			args_name: 'API_KEY',
			flags_dir: actorDir,
			flags_yes: true,
			flags_json: true,
		});

		expect(JSON.parse(logMessages.log.join('\n'))).toEqual({
			ok: true,
			operation: 'env-rm',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			name: 'API_KEY',
		});
		expectNoSecretValue(instance);
	});

	it('reports an API failure with exit code 1', async () => {
		envPlatform.failNext('delete', 'API_KEY', new Error('Request failed'));

		await testRunCommand(EnvRmCommand, { args_name: 'API_KEY', flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toContain(
			"Couldn't delete API_KEY from tester/my-actor version 0.0: Request failed",
		);
		expect(envVarNames()).toEqual(['LOG_LEVEL', 'API_KEY']);
	});
});
