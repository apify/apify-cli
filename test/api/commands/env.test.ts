import process from 'node:process';

import { ActorSourceType } from 'apify-client';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { testUserClient } from '../../__setup__/config.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useUniqueId } from '../../__setup__/hooks/useUniqueId.js';

const SECRET_VALUE = 's3cr3t-sentinel';

useAuthSetup({ perTest: false });

const { logMessages } = useConsoleSpy();

const { EnvLsCommand } = await import('../../../src/commands/env/ls.js');

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
