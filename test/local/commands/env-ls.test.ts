import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { EnvLsCommand } from '../../../src/commands/env/ls.js';
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

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('env-ls', {
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

interface FakeActor {
	id: string;
	name: string;
	username: string;
	versions: { versionNumber: string; sourceType: string; envVars: FakeEnvVar[] }[];
}

const SECRET_VALUE = 'super-secret-value';

const actors: FakeActor[] = [
	{
		id: 'fooId',
		name: 'foo',
		username: 'me',
		versions: [
			{
				versionNumber: '0.0',
				sourceType: 'SOURCE_FILES',
				envVars: [
					{ name: 'LOG_LEVEL', value: 'debug', isSecret: false },
					// The API shouldn't return a secret's value, but the CLI must not print it even when it does.
					{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
				],
			},
			{ versionNumber: '0.1', sourceType: 'SOURCE_FILES', envVars: [{ name: 'IN_0_1', value: 'yes' }] },
			{ versionNumber: '0.2', sourceType: 'SOURCE_FILES', envVars: [] },
		],
	},
	{
		id: 'gitId',
		name: 'from-git',
		username: 'me',
		versions: [{ versionNumber: '0.0', sourceType: 'GIT_REPO', envVars: [{ name: 'FROM_GIT', value: '1' }] }],
	},
];

const fakeClient = () =>
	({
		actor: (idOrName: string) => {
			const actor = actors.find((a) => a.id === idOrName || `${a.username}/${a.name}` === idOrName);
			return {
				get: async () =>
					actor && {
						id: actor.id,
						name: actor.name,
						username: actor.username,
						versions: actor.versions.map(({ versionNumber, sourceType }) => ({ versionNumber, sourceType })),
					},
				version: (versionNumber: string) => ({
					envVars: () => ({
						list: async () => {
							const items = actor?.versions.find((v) => v.versionNumber === versionNumber)?.envVars ?? [];
							return { items, total: items.length };
						},
					}),
				}),
			};
		},
	}) as unknown as ApifyClient;

const writeActorJson = (dir: string, config: Record<string, unknown>) => {
	mkdirSync(join(dir, '.actor'), { recursive: true });
	writeFileSync(join(dir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, ...config }));
};

const stdout = () => logMessages.log.join('\n');
const stderr = () => logMessages.error.join('\n');

let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	await beforeAllCalls();
	resetCwdCaches();
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient());
	mockGetCurrentUserInfo.mockResolvedValue({ id: 'meId', username: 'me' });
});

afterEach(async () => {
	process.exitCode = originalExitCode;
	mockGetLoggedClientOrThrow.mockReset();
	mockGetCurrentUserInfo.mockReset();
	await afterAllCalls();
});

describe('apify env ls', () => {
	it('lists the version from actor.json, without secret values', async () => {
		writeActorJson(joinPath(), { name: 'foo', version: '0.0' });

		await testRunCommand(EnvLsCommand, {});

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain('version 0.0 of Actor me/foo');
		expect(stdout()).toContain('LOG_LEVEL');
		expect(stdout()).toContain('debug');
		expect(stdout()).toContain('API_KEY');
		expect(stdout()).toContain('(hidden)');
		expect(stdout()).not.toContain(SECRET_VALUE);
		expect(stdout().indexOf('API_KEY')).toBeLessThan(stdout().indexOf('LOG_LEVEL'));
	});

	it('uses the version from actor.json', async () => {
		writeActorJson(joinPath(), { name: 'foo', version: '0.1' });

		await testRunCommand(EnvLsCommand, {});

		expect(stdout()).toContain('IN_0_1');
	});

	it('targets an Actor with --actor and defaults to version 0.0', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo' });

		expect(stdout()).toContain('version 0.0 of Actor me/foo');
		expect(stdout()).toContain('LOG_LEVEL');
	});

	it('ignores the local actor.json version when --actor is passed', async () => {
		writeActorJson(joinPath(), { name: 'other', version: '0.5' });

		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo' });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain('version 0.0 of Actor me/foo');
	});

	it('takes the version from --version', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo', flags_version: '0.1' });

		expect(stdout()).toContain('IN_0_1');
	});

	it('reads actor.json from --dir', async () => {
		writeActorJson(joinPath('actors', 'foo'), { name: 'foo', version: '0.1' });

		await testRunCommand(EnvLsCommand, { flags_dir: join('actors', 'foo') });

		expect(stdout()).toContain('version 0.1 of Actor me/foo');
	});

	it('lists a Git-sourced Actor', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/from-git' });

		expect(stdout()).toContain('FROM_GIT');
	});

	it('prints JSON without secret values', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo', flags_json: true });

		expect(JSON.parse(stdout())).toStrictEqual({
			actor: { id: 'fooId', name: 'me/foo' },
			version: '0.0',
			envVars: [
				{ name: 'API_KEY', isSecret: true },
				{ name: 'LOG_LEVEL', isSecret: false, value: 'debug' },
			],
		});
	});

	it('says when a version has no environment variables', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo', flags_version: '0.2' });

		expect(process.exitCode).toBeUndefined();
		expect(stdout()).toContain("Version 0.2 of Actor me/foo doesn't have any environment variables.");
	});

	it('fails when the Actor does not exist', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/nope' });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(stderr()).toContain('me/nope');
	});

	it('fails when the version does not exist, and lists the versions', async () => {
		await testRunCommand(EnvLsCommand, { flags_actor: 'me/foo', flags_version: '0.9' });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(stderr()).toContain("Version 0.9 doesn't exist for Actor me/foo. Its versions: 0.0, 0.1, 0.2.");
	});

	it('fails without --actor outside an Actor project', async () => {
		await testRunCommand(EnvLsCommand, {});

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		expect(stderr()).toContain('No Actor specified');
	});

	it('rejects --dir together with --actor', async () => {
		await expect(testRunCommand(EnvLsCommand, { flags_actor: 'me/foo', flags_dir: '.' })).rejects.toThrow(
			'APIFY_FLAG_IS_EXCLUSIVE_WITH_ANOTHER_FLAG',
		);

		expect(stdout()).not.toContain('LOG_LEVEL');
	});
});
