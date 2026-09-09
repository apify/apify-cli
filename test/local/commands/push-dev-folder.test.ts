import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'push-dev-folder-actor';
const ACTOR_ID = 'aBcD1234efGh';
const RUNTIME_BASE_URL = 'http://localhost:3333/v2';
const CLOUD_BASE_URL = 'https://api.apify.com/v2';

const actor = {
	id: ACTOR_ID,
	name: actName,
	// Older than any local file, so the "modified on the platform" check never trips.
	modifiedAt: new Date(0),
	taggedBuilds: { latest: { buildId: 'build1' } },
};
const build = { id: 'build1', actId: ACTOR_ID, buildNumber: '0.0.1', status: 'SUCCEEDED' };
const currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };

// Which API the mocked client "talks to" - the runtime, or the Apify cloud.
let baseUrl = RUNTIME_BASE_URL;

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getLocalUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl,
		token: 'my-token',
		actor: () => ({
			get: async () => actor,
			version: () => ({ get: async () => currentVersion, update: async () => ({}) }),
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

// Stands in for the runtime's `POST /actor-runtime/dev-folder/:actorId`: echoes back what it was sent.
const fetchMock = vitest.fn<typeof fetch>(async (_url, init) => {
	const requested = JSON.parse(init?.body as string) as string;
	return new Response(JSON.stringify({ data: { localDevFolder: requested || null } }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
});

const devFolderCalls = () =>
	fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(init?.body as string) as string }));

let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = process.exitCode;
	baseUrl = RUNTIME_BASE_URL;
	fetchMock.mockClear();
	vitest.stubGlobal('fetch', fetchMock);
	await beforeAllCalls();
	await mkdir(joinPath('.actor'), { recursive: true });
	await writeFile(
		joinPath(LOCAL_CONFIG_PATH),
		JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest' }),
	);
	await writeFile(join(joinPath('.actor'), 'main.js'), 'console.log("hi")');
});

afterEach(async () => {
	vitest.unstubAllGlobals();
	process.exitCode = originalExitCode;
	await afterAllCalls();
});

describe('apify push against a local Actor runtime', () => {
	it('registers the pushed directory as the live dev folder by default', async () => {
		await testRunCommand(ActorsPushCommand, {});

		expect(process.exitCode).toBeFalsy();
		expect(devFolderCalls()).toEqual([
			{ url: `${RUNTIME_BASE_URL}/actor-runtime/dev-folder/${ACTOR_ID}`, body: tmpPath },
		]);
		expect(logMessages.error.join('\n')).toContain(`Registered ${tmpPath} as the live dev folder`);
		expect(logMessages.log.join('\n')).toContain(`Live dev folder: ${tmpPath}`);
	});

	it('registers the --dir directory, not the cwd, when pushing another folder', async () => {
		await mkdir(joinPath('nested', '.actor'), { recursive: true });
		await writeFile(
			joinPath('nested', LOCAL_CONFIG_PATH),
			JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest' }),
		);
		await writeFile(joinPath('nested', '.actor', 'main.js'), 'console.log("nested")');

		await testRunCommand(ActorsPushCommand, { flags_dir: 'nested' });

		expect(devFolderCalls().map((call) => call.body)).toEqual([join(tmpPath, 'nested')]);
	});

	it('clears the registration with --no-dev-folder', async () => {
		await testRunCommand(ActorsPushCommand, { flags_devFolder: false });

		expect(process.exitCode).toBeFalsy();
		expect(devFolderCalls().map((call) => call.body)).toEqual(['']);
		expect(logMessages.error.join('\n')).toContain('has no live dev folder');
		expect(logMessages.log.join('\n')).toContain('Live dev folder: none');
	});

	it('reports the registered folder in --json output', async () => {
		await testRunCommand(ActorsPushCommand, { flags_json: true });

		const result = JSON.parse(logMessages.log.find((line) => line.startsWith('{'))!) as Record<string, unknown>;
		expect(result).toMatchObject({ ok: true, localDevFolder: tmpPath });
	});

	it('warns, but still reports a successful push, when the runtime refuses the path', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error: { type: 'dev-folder-path-not-found', message: 'The submitted path does not exist on the host.' },
				}),
				{ status: 400, headers: { 'content-type': 'application/json' } },
			),
		);

		await testRunCommand(ActorsPushCommand, {});

		expect(process.exitCode).toBeFalsy();
		expect(logMessages.error.join('\n')).toContain('The submitted path does not exist on the host.');
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
		expect(logMessages.log.join('\n')).not.toContain('Live dev folder:');
	});

	it('stays quiet when the non-cloud target turns out not to be an Actor runtime (404)', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{"error":{"type":"record-not-found"}}', { status: 404 }));

		await testRunCommand(ActorsPushCommand, {});

		expect(process.exitCode).toBeFalsy();
		expect(logMessages.error.join('\n')).not.toContain('dev folder');
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});

describe('apify push against the Apify platform', () => {
	beforeEach(() => {
		baseUrl = CLOUD_BASE_URL;
	});

	it('never calls the runtime endpoint, with or without the flag', async () => {
		await testRunCommand(ActorsPushCommand, {});
		await testRunCommand(ActorsPushCommand, { flags_devFolder: false });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).not.toContain('dev folder');
		expect(logMessages.log.join('\n')).not.toContain('Live dev folder');
	});
});
