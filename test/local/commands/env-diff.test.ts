import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { EnvDiffCommand } from '../../../src/commands/env/diff.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const { mockGetLoggedClientOrThrow, mockGetCurrentUserInfo } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
	mockGetCurrentUserInfo: vitest.fn(),
}));

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
		getCurrentUserInfo: mockGetCurrentUserInfo,
	};
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('env-diff', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

interface FakeEnvVar {
	name: string;
	value?: string;
	isSecret?: boolean;
}

const PLATFORM_SECRET_VALUE = 'platform-secret-value';
const LOCAL_SECRET_VALUE = 'local-secret-value';

let platformEnvVars: FakeEnvVar[];

const fakeClient = () =>
	({
		actor: (idOrName: string) => ({
			get: async () =>
				idOrName === 'fooId' || idOrName === 'me/foo'
					? { id: 'fooId', name: 'foo', username: 'me', versions: [{ versionNumber: '0.0' }] }
					: undefined,
			version: () => ({
				envVars: () => ({
					list: async () => ({ items: platformEnvVars, total: platformEnvVars.length }),
				}),
			}),
		}),
	}) as unknown as ApifyClient;

const writeProject = (dir: string, dotEnv?: string) => {
	mkdirSync(join(dir, '.actor'), { recursive: true });
	writeFileSync(
		join(dir, '.actor', 'actor.json'),
		JSON.stringify({ actorSpecification: 1, name: 'foo', version: '0.0' }),
	);
	if (dotEnv !== undefined) writeFileSync(join(dir, '.env'), dotEnv);
};

const stdout = () => logMessages.log.join('\n');
const allOutput = () => [...logMessages.log, ...logMessages.error].join('\n');

let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	await beforeAllCalls();
	resetCwdCaches();
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	platformEnvVars = [
		{ name: 'LOG_LEVEL', value: 'debug', isSecret: false },
		{ name: 'API_KEY', value: PLATFORM_SECRET_VALUE, isSecret: true },
	];
	mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient());
	mockGetCurrentUserInfo.mockResolvedValue({ id: 'meId', username: 'me' });
});

afterEach(async () => {
	process.exitCode = originalExitCode;
	mockGetLoggedClientOrThrow.mockReset();
	mockGetCurrentUserInfo.mockReset();
	await afterAllCalls();
});

describe('apify env diff', () => {
	it('exits 0 when .env and the platform are in sync', async () => {
		writeProject(joinPath(), `LOG_LEVEL=debug\nAPI_KEY=${LOCAL_SECRET_VALUE}\n`);

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain('.env and version 0.0 of Actor me/foo are in sync.');
	});

	it('treats an empty local value of a secret as in sync', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=debug\nAPI_KEY=\n');

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBeUndefined();
	});

	it('reports a name only in .env and exits 1', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=debug\nAPI_KEY=x\nNEW_KEY=1\n');

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('Only in .env:');
		expect(stdout()).toContain('+ NEW_KEY');
	});

	it('reports a name only on the platform and exits 1', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=debug\n');

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('Only on the platform:');
		expect(stdout()).toContain('- API_KEY');
	});

	it('reports a plain variable with another value and exits 1', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=info\nAPI_KEY=x\n');

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(stdout()).toContain('Different values:');
		expect(stdout()).toContain('~ LOG_LEVEL');
	});

	it('never prints a value', async () => {
		writeProject(joinPath(), `LOG_LEVEL=local-plain-value\nAPI_KEY=${LOCAL_SECRET_VALUE}\nNEW_KEY=new-value\n`);

		await testRunCommand(EnvDiffCommand, {});

		for (const value of ['local-plain-value', 'debug', 'new-value', LOCAL_SECRET_VALUE, PLATFORM_SECRET_VALUE]) {
			expect(allOutput()).not.toContain(value);
		}
	});

	it('prints every kind of difference as JSON and still exits 1', async () => {
		platformEnvVars.push({ name: 'ONLY_REMOTE', value: 'x', isSecret: false });
		writeProject(joinPath(), 'LOG_LEVEL=info\nAPI_KEY=x\nNEW_KEY=1\n');

		await testRunCommand(EnvDiffCommand, { flags_json: true });

		expect(process.exitCode).toBe(CommandExitCodes.EnvDiffFound);
		expect(JSON.parse(stdout())).toStrictEqual({
			actor: { id: 'fooId', name: 'me/foo' },
			version: '0.0',
			inSync: false,
			onlyInDotEnv: ['NEW_KEY'],
			onlyOnPlatform: ['ONLY_REMOTE'],
			differentValues: ['LOG_LEVEL'],
		});
	});

	it('prints JSON when in sync', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=debug\nAPI_KEY=x\n');

		await testRunCommand(EnvDiffCommand, { flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(JSON.parse(stdout())).toMatchObject({
			inSync: true,
			onlyInDotEnv: [],
			onlyOnPlatform: [],
			differentValues: [],
		});
	});

	it('reads .env from --dir', async () => {
		writeProject(joinPath('actors', 'foo'), 'LOG_LEVEL=debug\nAPI_KEY=x\nIN_DIR=1\n');

		await testRunCommand(EnvDiffCommand, { flags_dir: join('actors', 'foo') });

		expect(stdout()).toContain('+ IN_DIR');
	});

	it('fails without a .env file', async () => {
		writeProject(joinPath());

		await testRunCommand(EnvDiffCommand, {});

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(logMessages.error.join('\n')).toContain('No .env file in');
	});

	it('fails when the version does not exist', async () => {
		writeProject(joinPath(), 'LOG_LEVEL=debug\n');

		await testRunCommand(EnvDiffCommand, { flags_version: '0.9' });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(logMessages.error.join('\n')).toContain("Version 0.9 doesn't exist");
	});
});
