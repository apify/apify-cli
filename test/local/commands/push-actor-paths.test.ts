import { mkdir, rm, writeFile } from 'node:fs/promises';
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
const { getLoggedClientOrThrow } = await import('../../../src/lib/utils.js');
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
	vitest.mocked(getLoggedClientOrThrow).mockClear();
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
	it('stops before logging in or reading or writing the Actor, listing every wrong path', async () => {
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
		// The platform falls back from a readme it cannot find, so that one is only a warning.
		expect(stderr).toContain('The push continues, and the platform falls back to its default README or CHANGELOG:');
		expect(stderr).toContain(
			`"readme": "../Dockerfile.ci" (${joinPath('Dockerfile.ci')}) is not among the files apify push uploads (excluded by .gitignore or .actorignore?).`,
		);
		expect(stderr).toContain(
			`"input": "../../INPUT_SCHEMA.json" (${joinPath('..', 'INPUT_SCHEMA.json')}) lies outside the uploaded folder ${tmpPath}.`,
		);
		expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
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

	it.each([
		['dockerfile', '../Dockerfile.prod', 'Dockerfile.prod'],
		['input', './missing.json', '.actor/missing.json'],
	])('stops on a missing %s file', async (field, value, resolvedPath) => {
		await writeActorConfig({ [field]: value });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(
			`"${field}": "${value}" (${joinPath(resolvedPath)}) does not exist.`,
		);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it.each([
		['absolute', '/README.md', 'is absolute'],
		['outside the uploaded folder', '../../README.md', 'lies outside the uploaded folder'],
	])('stops on an %s readme, which fails the build', async (_, readme, reason) => {
		await writeActorConfig({ readme });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('.actor/actor.json refers to files the Apify platform could not use:');
		expect(stderr).toContain(`"readme": "${readme}"`);
		expect(stderr).toContain(reason);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('warns about a readme only in the Actor folder and pushes, keeping stdout clean with --json', async () => {
		// The shape of the js-cypress template: the platform finds no .actor/README.md and falls back to README.md.
		await write('README.md', '# Actor\n');
		await writeActorConfig({ readme: './README.md', dockerfile: '../Dockerfile' });

		await testRunCommand(ActorsPushCommand, { flags_json: true });

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('The push continues, and the platform falls back to its default README or CHANGELOG:');
		expect(stderr).toContain(`"readme": "./README.md" (${joinPath('.actor', 'README.md')}) does not exist.`);
		expect(stderr).not.toContain('could not use');
		const stdout = logMessages.log.join('\n');
		expect(stdout).not.toContain('README');
		expect(() => JSON.parse(stdout)).not.toThrow();
	});

	it('warns about a missing changelog and pushes', async () => {
		await writeActorConfig({ changelog: '../CHANGELOG.md' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(logMessages.error.join('\n')).toContain(
			`"changelog": "../CHANGELOG.md" (${joinPath('CHANGELOG.md')}) does not exist.`,
		);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});

	it('stops when the default Dockerfile lies outside the Docker context', async () => {
		await write('docker/Dockerfile', 'FROM apify/actor-node:20\n');
		await writeActorConfig({ dockerContextDir: '../docker' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(
			`"dockerfile" is not set, so the platform would use the default ${joinPath('Dockerfile')}, which lies outside the Docker context ${joinPath('docker')}.`,
		);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('stops when the platform would build a Docker context with its built-in Dockerfile', async () => {
		await rm(joinPath('Dockerfile'));
		await write('docker/Dockerfile', 'FROM apify/actor-node:20\n');
		await writeActorConfig({ dockerContextDir: '../docker' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(
			`"dockerfile" is not set and push uploads no .actor/Dockerfile or Dockerfile in the Actor folder, so the platform would build the Docker context ${joinPath('docker')} with its built-in Node.js Dockerfile`,
		);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it.each([
		['the Actor folder as the Docker context', { dockerContextDir: '..' }],
		['no Docker context', {}],
	])('pushes without any Dockerfile and with %s', async (_, fields) => {
		await rm(joinPath('Dockerfile'));
		await writeActorConfig(fields);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(logMessages.error.join('\n')).not.toContain('actor.json refers to files');
		expect(versionUpdate).toHaveBeenCalledTimes(1);
	});

	it('pushes with a default .actor/Dockerfile inside the Docker context', async () => {
		await write('.actor/Dockerfile', 'FROM apify/actor-node:20\n');
		await writeActorConfig({ dockerContextDir: '.' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
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
