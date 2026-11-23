import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvLsCommand } from '../../../../src/commands/env/ls.js';
import { EnvRmCommand } from '../../../../src/commands/env/rm.js';
import { EnvSetCommand } from '../../../../src/commands/env/set.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

// Unmocked, both cache per process and the implicit read waits on the worker's stdin.
const stdin = vitest.hoisted(() => ({ data: undefined as Buffer | undefined, isTTY: false }));
vitest.mock('../../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ isTTY: stdin.isTTY, hasData: !stdin.isTTY, waitDelay: 0, stream: process.stdin }),
}));
vitest.mock('../../../../src/lib/commands/read-stdin.js', () => ({
	readStdin: async () => stdin.data,
	stdinWasCutShort: () => false,
}));
// A terminal prompts only outside CI, so the TTY test must not depend on the CI the suite runs in.
vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	isCI: false,
}));
const maskedInput = vitest.hoisted(() => vitest.fn());
const userInput = vitest.hoisted(() => vitest.fn());
vitest.mock('../../../../src/lib/hooks/user-confirmations/useMaskedInput.js', () => ({ useMaskedInput: maskedInput }));
vitest.mock('../../../../src/lib/hooks/user-confirmations/useUserInput.js', () => ({ useUserInput: userInput }));

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

const envVarsOnPlatform = () => envPlatform.state.actors[0].versions[0].envVars;

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	resetCwdCaches();
	vitest.mocked(getLoggedClientOrThrow).mockClear();
	stdin.data = Buffer.from(`${SECRET_VALUE}\n`);
	stdin.isTTY = false;
	maskedInput.mockReset().mockResolvedValue(SECRET_VALUE);
	userInput.mockReset().mockResolvedValue(SECRET_VALUE);
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
					{ name: 'API_KEY', value: 'old-secret', isSecret: true },
				],
			},
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-set-test-'));
	mkdirSync(join(actorDir, '.actor'));
	writeFileSync(join(actorDir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name: 'my-actor' }));
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

const expectNoValue = (instance: unknown) => {
	expect(logMessages.log.join('\n')).not.toContain(SECRET_VALUE);
	expect(logMessages.error.join('\n')).not.toContain(SECRET_VALUE);
	expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(SECRET_VALUE);
};

const rebuildReminder =
	'Rebuild the Actor before runs see the change: apify builds create tester/my-actor --version 0.0';

describe('apify env set', () => {
	it('creates a plain variable from stdin by default', async () => {
		const instance = await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_dir: actorDir });

		expect(envVarsOnPlatform()).toContainEqual({ name: 'NEW_VAR', value: SECRET_VALUE, isSecret: false });
		expect(envPlatform.writes).toEqual([{ method: 'create', actorId: 'actor-1', version: '0.0', name: 'NEW_VAR' }]);
		expect(logMessages.log.join('\n')).toContain('Created NEW_VAR on tester/my-actor version 0.0.');
		expect(logMessages.error.join('\n')).toContain(rebuildReminder);
		expect(process.exitCode).toBeUndefined();
		expectNoValue(instance);
	});

	it('creates a secret with --secret', async () => {
		const instance = await testRunCommand(EnvSetCommand, {
			args_name: 'NEW_SECRET',
			flags_dir: actorDir,
			flags_secret: true,
		});

		expect(envVarsOnPlatform()).toContainEqual({ name: 'NEW_SECRET', value: SECRET_VALUE, isSecret: true });
		expect(logMessages.log.join('\n')).toContain('Created NEW_SECRET (secret) on tester/my-actor version 0.0.');
		expectNoValue(instance);
	});

	it('updates an existing secret and keeps its type', async () => {
		const instance = await testRunCommand(EnvSetCommand, { args_name: 'API_KEY', flags_dir: actorDir });

		expect(envVarsOnPlatform()).toContainEqual({ name: 'API_KEY', value: SECRET_VALUE, isSecret: true });
		expect(envPlatform.writes).toEqual([{ method: 'update', actorId: 'actor-1', version: '0.0', name: 'API_KEY' }]);
		expect(logMessages.log.join('\n')).toContain('Updated API_KEY (secret) on tester/my-actor version 0.0.');
		expect(logMessages.error.join('\n')).not.toContain('Changed API_KEY');
		expectNoValue(instance);
	});

	it('updates an existing plain variable and keeps its type', async () => {
		await testRunCommand(EnvSetCommand, { args_name: 'LOG_LEVEL', flags_dir: actorDir });

		expect(envVarsOnPlatform()).toContainEqual({ name: 'LOG_LEVEL', value: SECRET_VALUE, isSecret: false });
		expect(logMessages.log.join('\n')).toContain('Updated LOG_LEVEL on tester/my-actor version 0.0.');
	});

	it('changes a secret to plain with --no-secret', async () => {
		const instance = await testRunCommand(EnvSetCommand, {
			args_name: 'API_KEY',
			flags_dir: actorDir,
			flags_secret: false,
		});

		expect(envVarsOnPlatform()).toContainEqual({ name: 'API_KEY', value: SECRET_VALUE, isSecret: false });
		expect(logMessages.error.join('\n')).toContain('Changed API_KEY from secret to plain.');
		expectNoValue(instance);
	});

	it('changes a plain variable to secret with --secret', async () => {
		await testRunCommand(EnvSetCommand, { args_name: 'LOG_LEVEL', flags_dir: actorDir, flags_secret: true });

		expect(envVarsOnPlatform()).toContainEqual({ name: 'LOG_LEVEL', value: SECRET_VALUE, isSecret: true });
		expect(logMessages.error.join('\n')).toContain('Changed LOG_LEVEL from plain to secret.');
	});

	it('prints JSON without the value', async () => {
		const instance = await testRunCommand(EnvSetCommand, {
			args_name: 'NEW_SECRET',
			flags_dir: actorDir,
			flags_secret: true,
			flags_json: true,
		});

		expect(JSON.parse(logMessages.log.join('\n'))).toEqual({
			ok: true,
			operation: 'env-set',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			name: 'NEW_SECRET',
			isSecret: true,
			created: true,
		});
		expect(logMessages.error.join('\n')).toContain(rebuildReminder);
		expectNoValue(instance);
	});

	it('reports an update as created: false in JSON', async () => {
		await testRunCommand(EnvSetCommand, { args_name: 'LOG_LEVEL', flags_dir: actorDir, flags_json: true });

		expect(JSON.parse(logMessages.log.join('\n'))).toMatchObject({
			name: 'LOG_LEVEL',
			isSecret: false,
			created: false,
		});
	});

	it('fails on an empty value and writes nothing', async () => {
		stdin.data = Buffer.from('\n');

		await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(logMessages.error.join('\n')).toContain('The value of NEW_VAR is empty.');
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails when stdin has no value and writes nothing', async () => {
		stdin.data = undefined;

		await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(logMessages.error.join('\n')).toContain('No value for NEW_VAR.');
		expect(envPlatform.writes).toEqual([]);
	});

	it('fails on an invalid name before any API call, without echoing a value in it', async () => {
		await testRunCommand(EnvSetCommand, { args_name: `API_KEY=${SECRET_VALUE}`, flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(logMessages.error.join('\n')).toContain('can\'t contain "="');
		expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).not.toContain(SECRET_VALUE);
	});

	it('escapes control characters in the name it prints', async () => {
		await testRunCommand(EnvSetCommand, { args_name: 'CLEAR\u001b[2J', flags_dir: actorDir });

		expect(envVarsOnPlatform()).toContainEqual({ name: 'CLEAR\u001b[2J', value: SECRET_VALUE, isSecret: false });
		expect(logMessages.log.join('\n')).toContain('Created CLEAR\\x1b[2J on tester/my-actor version 0.0.');
		expect(`${logMessages.log.join('\n')}\n${logMessages.error.join('\n')}`).not.toContain('\u001b[2J');
	});

	it('reports an API failure with exit code 1 and without the value', async () => {
		envPlatform.failNext('create', 'NEW_VAR', new Error('Request failed'));

		const instance = await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_dir: actorDir });

		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toContain(
			"Couldn't set NEW_VAR on tester/my-actor version 0.0: Request failed",
		);
		expect(logMessages.log).toEqual([]);
		expectNoValue(instance);
	});

	it('targets an Actor with --actor and --version', async () => {
		envPlatform.state.actors[0].versions.push({ versionNumber: '1.0', envVars: [] });

		await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_actor: 'tester/my-actor', flags_version: '1.0' });

		expect(envPlatform.writes).toEqual([{ method: 'create', actorId: 'actor-1', version: '1.0', name: 'NEW_VAR' }]);
		expect(logMessages.error.join('\n')).toContain('apify builds create tester/my-actor --version 1.0');
	});

	it('masks the prompt in a terminal when the variable stays secret, also without --secret', async () => {
		stdin.isTTY = true;

		const instance = await testRunCommand(EnvSetCommand, { args_name: 'API_KEY', flags_dir: actorDir });

		expect(maskedInput).toHaveBeenCalledWith({ message: 'Value of API_KEY:' });
		expect(userInput).not.toHaveBeenCalled();
		expect(envVarsOnPlatform()).toContainEqual({ name: 'API_KEY', value: SECRET_VALUE, isSecret: true });
		expectNoValue(instance);
	});

	it('uses the plain prompt in a terminal for a new variable without --secret', async () => {
		stdin.isTTY = true;

		await testRunCommand(EnvSetCommand, { args_name: 'NEW_VAR', flags_dir: actorDir });

		expect(userInput).toHaveBeenCalledWith({ message: 'Value of NEW_VAR:' });
		expect(maskedInput).not.toHaveBeenCalled();
	});

	it('sets a variable through stdin, lists it with env ls, and removes it with env rm', async () => {
		const setInstance = await testRunCommand(EnvSetCommand, {
			args_name: 'ROUND_TRIP',
			flags_dir: actorDir,
			flags_secret: true,
		});

		const lsStart = logMessages.log.length;
		await testRunCommand(EnvLsCommand, { flags_dir: actorDir, flags_json: true });
		expect(JSON.parse(logMessages.log.slice(lsStart).join('\n')).envVars).toContainEqual({
			name: 'ROUND_TRIP',
			isSecret: true,
		});

		const rmInstance = await testRunCommand(EnvRmCommand, {
			args_name: 'ROUND_TRIP',
			flags_dir: actorDir,
			flags_yes: true,
		});
		expect(envVarsOnPlatform().map(({ name }) => name)).not.toContain('ROUND_TRIP');
		expect(process.exitCode).toBeUndefined();

		expectNoValue(setInstance);
		expectNoValue(rmInstance);
	});
});
