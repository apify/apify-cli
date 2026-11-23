import process from 'node:process';

import { ActorSourceType } from 'apify-client';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { testUserClient } from '../../__setup__/config.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useUniqueId } from '../../__setup__/hooks/useUniqueId.js';

const SECRET_VALUE = 's3cr3t-sentinel';
const SET_VALUE = 's3cr3t-value';

// `apify env set` reads the value from stdin here. Unmocked, both modules cache per process and wait on the worker's stdin.
vitest.mock('../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ isTTY: false, hasData: true, waitDelay: 0, stream: process.stdin }),
}));
vitest.mock('../../../src/lib/commands/read-stdin.js', () => ({
	readStdin: async () => Buffer.from(`${SET_VALUE}\n`),
	stdinWasCutShort: () => false,
}));

useAuthSetup({ perTest: false });

const { logMessages } = useConsoleSpy();

const { EnvLsCommand } = await import('../../../src/commands/env/ls.js');
const { EnvRmCommand } = await import('../../../src/commands/env/rm.js');
const { EnvSetCommand } = await import('../../../src/commands/env/set.js');

describe('[api] apify env ls', () => {
	const actorIds: string[] = [];
	let sourceFilesActorId: string;
	let gitRepoActorId: string;
	let originalExitCode: typeof process.exitCode;

	beforeAll(async () => {
		await safeLogin();

		const sourceFilesActor = await testUserClient.actors().create({
			name: useUniqueId('cli-env-ls'),
			isPublic: false,
			versions: [
				{
					versionNumber: '0.0',
					sourceType: ActorSourceType.SourceFiles,
					buildTag: 'latest',
					sourceFiles: [],
					envVars: [
						{ name: 'PLAIN_VAR', value: 'plain-value', isSecret: false },
						{ name: 'SECRET_VAR', value: SECRET_VALUE, isSecret: true },
					],
				},
			],
		});
		sourceFilesActorId = sourceFilesActor.id;
		actorIds.push(sourceFilesActor.id);

		const gitRepoActor = await testUserClient.actors().create({
			name: useUniqueId('cli-env-ls-git'),
			isPublic: false,
			versions: [
				{
					versionNumber: '0.0',
					sourceType: ActorSourceType.GitRepo,
					buildTag: 'latest',
					gitRepoUrl: 'https://github.com/apify/actor-templates',
					envVars: [
						{ name: 'PLAIN_VAR', value: 'plain-value', isSecret: false },
						{ name: 'SECRET_VAR', value: SECRET_VALUE, isSecret: true },
					],
				},
			],
		});
		gitRepoActorId = gitRepoActor.id;
		actorIds.push(gitRepoActor.id);
	}, TEST_TIMEOUT);

	afterAll(async () => {
		for (const actorId of actorIds) {
			await testUserClient.actor(actorId).delete();
		}
	}, TEST_TIMEOUT);

	beforeEach(() => {
		originalExitCode = process.exitCode;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it.each([
		['a CLI-pushed (source files)', () => sourceFilesActorId],
		['a Git-sourced', () => gitRepoActorId],
	])(
		'lists the env vars of %s Actor without secret values',
		async (_, actorId) => {
			await testRunCommand(EnvLsCommand, { flags_actor: actorId(), flags_json: true });

			const output = JSON.parse(logMessages.log.join('\n'));
			expect(output).toMatchObject({ ok: true, operation: 'env-ls', actor: { id: actorId() }, version: '0.0' });
			expect(output.envVars).toEqual(
				expect.arrayContaining([
					{ name: 'PLAIN_VAR', isSecret: false, value: 'plain-value' },
					{ name: 'SECRET_VAR', isSecret: true },
				]),
			);
			expect(output.envVars).toHaveLength(2);
			expect(logMessages.log.join('\n')).not.toContain(SECRET_VALUE);
			expect(logMessages.error.join('\n')).not.toContain(SECRET_VALUE);
		},
		TEST_TIMEOUT,
	);

	it(
		'fails with exit code 250 for an unknown version',
		async () => {
			await testRunCommand(EnvLsCommand, { flags_actor: sourceFilesActorId, flags_version: '9.9' });

			expect(process.exitCode).toBe(250);
			expect(logMessages.error.join('\n')).toContain("Version 9.9 doesn't exist");
		},
		TEST_TIMEOUT,
	);
});

describe('[api] apify env set and rm', () => {
	let actorId: string;
	let originalExitCode: typeof process.exitCode;

	beforeAll(async () => {
		await safeLogin();

		const actor = await testUserClient.actors().create({
			name: useUniqueId('cli-env-set-rm'),
			isPublic: false,
			versions: [
				{
					versionNumber: '0.0',
					sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES as never,
					buildTag: 'latest',
					sourceFiles: [],
				},
			],
		});
		actorId = actor.id;
	}, TEST_TIMEOUT);

	afterAll(async () => {
		if (actorId) {
			await testUserClient.actor(actorId).delete();
		}
	}, TEST_TIMEOUT);

	beforeEach(() => {
		originalExitCode = process.exitCode;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	// Parses only the new lines, so the final checks still see the output of every command.
	const listEnvVars = async () => {
		const start = logMessages.log.length;
		await testRunCommand(EnvLsCommand, { flags_actor: actorId, flags_json: true });
		return JSON.parse(logMessages.log.slice(start).join('\n')).envVars;
	};

	it(
		'sets a secret from stdin, lists it, and removes it without exposing the value',
		async () => {
			const setInstance = await testRunCommand(EnvSetCommand, {
				args_name: 'SET_RM_SECRET',
				flags_actor: actorId,
				flags_secret: true,
			});
			expect(process.exitCode).toBeFalsy();
			expect(logMessages.log.join('\n')).toContain('Created SET_RM_SECRET (secret)');

			const stored = await testUserClient.actor(actorId).version('0.0').envVar('SET_RM_SECRET').get();
			expect(stored).toMatchObject({ name: 'SET_RM_SECRET', isSecret: true });

			expect(await listEnvVars()).toEqual([{ name: 'SET_RM_SECRET', isSecret: true }]);

			const rmInstance = await testRunCommand(EnvRmCommand, {
				args_name: 'SET_RM_SECRET',
				flags_actor: actorId,
				flags_yes: true,
			});
			expect(process.exitCode).toBeFalsy();

			expect(await listEnvVars()).toEqual([]);

			expect(logMessages.log.join('\n')).not.toContain(SET_VALUE);
			expect(logMessages.error.join('\n')).not.toContain(SET_VALUE);
			for (const instance of [setInstance, rmInstance]) {
				expect(JSON.stringify((instance as unknown as Record<string, unknown>).telemetryData)).not.toContain(SET_VALUE);
			}
		},
		TEST_TIMEOUT,
	);
});
