import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { cwdCache } from '../../../src/lib/hooks/useActorConfig.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'push-actor-paths-actor';
const ACTOR_ID = 'pAtH1234efGh';

const actor = {
	id: ACTOR_ID,
	name: actName,
	// Older than any local file, so the "modified on the platform" check never trips.
	modifiedAt: new Date(0),
	taggedBuilds: { latest: { buildId: 'build1' } },
};
const build = { id: 'build1', actId: ACTOR_ID, buildNumber: '0.0.1', status: 'SUCCEEDED' };
const currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };

const actorGet = vitest.fn(async () => actor);
const versionUpdate = vitest.fn(async (_modifier: unknown) => ({}));
const versionCreate = vitest.fn(async (created: unknown) => created);

// Stands in for the platform: the Actor and its version exist, and every read and write is recorded.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl: 'https://api.apify.com/v2',
		actor: () => ({
			get: actorGet,
			version: () => ({ get: async () => currentVersion, update: versionUpdate }),
			versions: () => ({ create: versionCreate }),
			build: async () => build,
		}),
		build: () => ({ get: async () => build }),
	})),
}));

// The mocked `node:process` copy has no signal handlers; nothing here needs them.
vitest.mock('../../../src/lib/hooks/useAbortJobOnSignal.js', () => ({
	useAbortJobOnSignal: () => ({ [Symbol.dispose]() {} }),
}));

const { beforeAllCalls, afterAllCalls, joinPath, tmpPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const { ActorsPushCommand } = await import('../../../src/commands/actors/push.js');
// The command sets the exit code on this mocked copy of `node:process`, not on the global one.
const { default: commandProcess } = await import('node:process');

async function write(relativePath: string, content: string) {
	await mkdir(dirname(joinPath(relativePath)), { recursive: true });
	await writeFile(joinPath(relativePath), content);
}

async function writeActorConfig(fields: Record<string, unknown>) {
	await write(
		'.actor/actor.json',
		JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest', ...fields }),
	);
}

// The mocked copy may share the exit code with the real process, so both are restored.
let originalExitCode: typeof process.exitCode;
let originalGlobalExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = commandProcess.exitCode;
	originalGlobalExitCode = process.exitCode;
	actorGet.mockClear();
	versionUpdate.mockClear();
	versionCreate.mockClear();
	cwdCache.clear();
	await beforeAllCalls();

	await write('.actor/INPUT_SCHEMA.json', '{}');
	await write('.actorignore', 'Dockerfile.ci\n');
	await write('Dockerfile', 'FROM apify/actor-node:20\n');
	await write('Dockerfile.ci', 'FROM apify/actor-node:20\n');
	await write('src/main.js', 'console.log(1);\n');
});

afterEach(async () => {
	commandProcess.exitCode = originalExitCode;
	process.exitCode = originalGlobalExitCode;
	await afterAllCalls();
});

describe('apify push with file paths in actor.json', () => {
	it('stops before reading or writing the Actor, listing every wrong path', async () => {
		await writeActorConfig({
			dockerfile: '../Dockerfile.prod',
			readme: '../Dockerfile.ci',
			input: '../../INPUT_SCHEMA.json',
		});

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('.actor/actor.json refers to files the Apify platform could not use:');
		expect(stderr).toContain(`"dockerfile": "../Dockerfile.prod" (${joinPath('Dockerfile.prod')}) does not exist.`);
		expect(stderr).toContain(
			`"readme": "../Dockerfile.ci" (${joinPath('Dockerfile.ci')}) is not among the files apify push uploads (excluded by .gitignore or .actorignore?).`,
		);
		expect(stderr).toContain(
			`"input": "../../INPUT_SCHEMA.json" (${joinPath('..', 'INPUT_SCHEMA.json')}) lies outside the uploaded folder ${tmpPath}.`,
		);
		expect(actorGet).not.toHaveBeenCalled();
		expect(versionCreate).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('keeps stdout clean with --json', async () => {
		await writeActorConfig({ dockerfile: '../Dockerfile.prod' });

		await testRunCommand(ActorsPushCommand, { flags_json: true });

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.log).toEqual([]);
		expect(logMessages.error.join('\n')).toContain('"dockerfile": "../Dockerfile.prod"');
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('requires the Dockerfile inside a Docker context within the Actor folder', async () => {
		await write('docker/Dockerfile', 'FROM apify/actor-node:20\n');
		await writeActorConfig({ dockerContextDir: '../docker', dockerfile: '../Dockerfile' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(
			`"dockerfile": "../Dockerfile" (${joinPath('Dockerfile')}) lies outside the Docker context ${joinPath('docker')}.`,
		);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('pushes as usual when every path points to an uploaded file', async () => {
		await writeActorConfig({ dockerfile: '../dockerfile', input: './INPUT_SCHEMA.json' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		const modifier = versionUpdate.mock.calls[0][0] as { sourceFiles: { name: string }[] };
		expect(modifier.sourceFiles.map((file) => file.name).sort()).toEqual([
			'.actor/INPUT_SCHEMA.json',
			'.actor/actor.json',
			'.actorignore',
			'Dockerfile',
			'src/main.js',
		]);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});
