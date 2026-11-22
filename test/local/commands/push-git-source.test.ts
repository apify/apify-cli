import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

// Force `useYesNoConfirm` down its non-interactive path, so the prompt errors out instead of blocking on
// stdin. See src/lib/hooks/user-confirmations/_stdinCheckWrapper.ts.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

const actName = 'push-git-source-actor';
const ACTOR_ID = 'aBcD1234efGh';
const GIT_REPO_URL = 'git@github.com:apify/my-scraper.git';

const actor = {
	id: ACTOR_ID,
	name: actName,
	// Older than any local file, so the "modified on the platform" check never trips.
	modifiedAt: new Date(0),
	taggedBuilds: { latest: { buildId: 'build1' } },
};
const build = { id: 'build1', actId: ACTOR_ID, buildNumber: '0.0.1', status: 'SUCCEEDED' };

let currentVersion: Record<string, unknown>;
const versionUpdate = vitest.fn(async () => ({}));
const versionCreate = vitest.fn(async () => ({}));

// Stands in for the platform: the Actor exists, and the version's source type is what is under test.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl: 'https://api.apify.com/v2',
		actor: () => ({
			get: async () => actor,
			version: () => ({ get: async () => currentVersion, update: versionUpdate }),
			versions: () => ({ create: versionCreate }),
			build: async () => build,
		}),
		build: () => ({ get: async () => build }),
	})),
}));

// Passes through to the real prompt, which errors out under the `ci-info` mock above. A test that wants
// an interactive answer sets one with `mockResolvedValueOnce`.
const yesNoConfirm = vitest.hoisted(() => vitest.fn());
vitest.mock('../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js')>();
	yesNoConfirm.mockImplementation(original.useYesNoConfirm);
	return { useYesNoConfirm: yesNoConfirm };
});

// The mocked `node:process` copy has no signal handlers; nothing here needs them.
vitest.mock('../../../src/lib/hooks/useAbortJobOnSignal.js', () => ({
	useAbortJobOnSignal: () => ({ [Symbol.dispose]() {} }),
}));

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const { ActorsPushCommand } = await import('../../../src/commands/actors/push.js');
// envFail sets the exit code on this mocked copy of `node:process`, not on the global one.
const { default: commandProcess } = await import('node:process');

const run = (force = false) => testRunCommand(ActorsPushCommand, { flags_force: force });

// The command framework records a thrown error on the real `process`, not on the `node:process` copy
// `useTempPath({ cwd: true })` mocks. Put it back so a failing run cannot leak into the tests that follow.
let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = process.exitCode;
	commandProcess.exitCode = undefined;
	versionUpdate.mockClear();
	versionCreate.mockClear();
	yesNoConfirm.mockClear();
	await beforeAllCalls();
	await mkdir(joinPath('.actor'), { recursive: true });
	await writeFile(
		joinPath(LOCAL_CONFIG_PATH),
		JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest' }),
	);
	await writeFile(join(joinPath('.actor'), 'main.js'), 'console.log("hi")');
});

afterEach(async () => {
	process.exitCode = originalExitCode;
	await afterAllCalls();
});

describe('apify push on a Git-sourced Actor', () => {
	beforeEach(() => {
		currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.GIT_REPO, gitRepoUrl: GIT_REPO_URL };
	});

	it('stops before the upload when it cannot ask and --force is not set', async () => {
		await run();

		expect(process.exitCode).toBe(1);
		expect(versionUpdate).not.toHaveBeenCalled();

		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain(GIT_REPO_URL);
		expect(stderr).toContain('run git push instead');
		expect(stderr).toContain('To switch the source to the local files, use --force.');
	});

	it('leaves the Actor alone when the user says no', async () => {
		yesNoConfirm.mockResolvedValueOnce(false);

		await run();

		expect(process.exitCode).toBeFalsy();
		expect(versionUpdate).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).toContain('Push aborted');
	});

	it('switches the source to the local files when the user says yes', async () => {
		yesNoConfirm.mockResolvedValueOnce(true);

		await run();

		expect(process.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(versionUpdate.mock.calls[0][0 as never]).toMatchObject({ sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES });
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});

	it('does not ask with --force, but still says what it drops', async () => {
		await run(true);

		expect(process.exitCode).toBeFalsy();
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(versionUpdate.mock.calls[0][0 as never]).toMatchObject({ sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES });
		expect(logMessages.error.join('\n')).toContain(GIT_REPO_URL);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});

describe('apify push on an Actor that does not build from Git', () => {
	it.each([
		[ACTOR_SOURCE_TYPES.SOURCE_FILES, false],
		[ACTOR_SOURCE_TYPES.SOURCE_FILES, true],
		[ACTOR_SOURCE_TYPES.TARBALL, false],
	])('neither asks nor warns for %s with force=%s', async (sourceType, force) => {
		currentVersion = { versionNumber: '0.0', sourceType };

		await run(force);

		expect(process.exitCode).toBeFalsy();
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(logMessages.error.join('\n')).not.toContain('Git repository');
	});
});

describe('apify push telemetry', () => {
	beforeEach(() => {
		currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };
		// actor.json changes between these tests, so the cached config must not carry over.
		resetCwdCaches();
	});

	it('records how many environmentVariables and @secret references actor.json has, also when the push stops on them', async () => {
		await writeFile(
			joinPath(LOCAL_CONFIG_PATH),
			JSON.stringify({
				actorSpecification: 1,
				name: actName,
				version: '0.0',
				buildTag: 'latest',
				environmentVariables: { PLAIN: 's3cr3t-sentinel', TOKEN: '@myToken', OTHER: 'value' },
			}),
		);

		const instance = await run(true);

		expect(versionUpdate).not.toHaveBeenCalled();
		expect(instance['telemetryData'].push).toEqual({ envVarsCount: 3, secretRefsCount: 1 });
		const telemetry = JSON.stringify(instance['telemetryData']);
		expect(telemetry).not.toContain('s3cr3t-sentinel');
		expect(telemetry).not.toContain('PLAIN');
		expect(telemetry).not.toContain('myToken');
	});

	it('records zero counts when actor.json has no environmentVariables', async () => {
		const instance = await run(true);

		expect(instance['telemetryData'].push).toEqual({
			actorId: ACTOR_ID,
			wasCreated: false,
			envVarsCount: 0,
			secretRefsCount: 0,
		});
	});
});

describe('apify push and environmentVariables', () => {
	const REMOVED =
		'"environmentVariables" in .actor/actor.json is no longer supported. Run apify env migrate to move the values to .env.';

	const writeActorJson = (extra: Record<string, unknown>) =>
		writeFile(
			joinPath(LOCAL_CONFIG_PATH),
			JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest', ...extra }),
		);

	beforeEach(() => {
		currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };
		resetCwdCaches();
	});

	it('fails with one line and exit code 5 before any upload when environmentVariables is non-empty', async () => {
		await writeActorJson({ environmentVariables: { PLAIN: 's3cr3t-sentinel', TOKEN: '@missingSecret' } });

		await run(true);

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(versionUpdate).not.toHaveBeenCalled();
		expect(versionCreate).not.toHaveBeenCalled();
		expect(logMessages.error.filter((line) => line.includes(REMOVED))).toHaveLength(1);
		expect(`${logMessages.log.join('\n')}${logMessages.error.join('\n')}`).not.toContain('s3cr3t-sentinel');
	});

	it.each([
		['an empty', { environmentVariables: {} }],
		['no', {}],
	])('pushes without envVars and without an error with %s environmentVariables', async (_label, extra) => {
		await writeActorJson(extra);

		await run(true);

		expect(process.exitCode).toBeFalsy();
		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(versionUpdate.mock.calls[0][0 as never]).not.toHaveProperty('envVars');
		expect(logMessages.error.join('\n')).not.toContain('environmentVariables');
	});

	it('sends no envVars when it creates the version', async () => {
		currentVersion = undefined as never;
		await writeActorJson({ applyEnvVarsToBuild: true });

		await run(true);

		expect(process.exitCode).toBeFalsy();
		expect(versionCreate).toHaveBeenCalledTimes(1);
		expect(versionCreate.mock.calls[0][0 as never]).not.toHaveProperty('envVars');
		expect(versionCreate.mock.calls[0][0 as never]).toMatchObject({ versionNumber: '0.0', applyEnvVarsToBuild: true });
	});

	it('still sends applyEnvVarsToBuild, from actor.json or the flag', async () => {
		await writeActorJson({ applyEnvVarsToBuild: true });

		await run(true);
		await testRunCommand(ActorsPushCommand, { flags_force: true, flags_applyEnvVarsToBuild: false });

		expect(versionUpdate.mock.calls[0][0 as never]).toMatchObject({ applyEnvVarsToBuild: true });
		expect(versionUpdate.mock.calls[1][0 as never]).toMatchObject({ applyEnvVarsToBuild: false });
	});
});
