import type { ApifyClient } from 'apify-client';

import { ActorsCallCommand } from '../../../src/commands/actors/call.js';
import { ActorsStartCommand } from '../../../src/commands/actors/start.js';
import { TaskRunCommand } from '../../../src/commands/task/run.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import type { RunOnCloudOptions } from '../../../src/lib/commands/run-on-cloud.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow, mockGetCurrentUserInfo, mockRunActorOrTaskOnCloud, mockFinalizeRun } =
	vitest.hoisted(() => ({
		mockGetLoggedClientOrThrow: vitest.fn(),
		mockGetCurrentUserInfo: vitest.fn(),
		mockRunActorOrTaskOnCloud: vitest.fn(),
		mockFinalizeRun: vitest.fn(),
	}));

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
		getCurrentUserInfo: mockGetCurrentUserInfo,
	};
});

vitest.mock('../../../src/lib/commands/run-on-cloud.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/commands/run-on-cloud.js')>();
	return {
		...original,
		runActorOrTaskOnCloud: mockRunActorOrTaskOnCloud,
	};
});

vitest.mock('../../../src/lib/commands/run-result.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/commands/run-result.js')>();
	return {
		...original,
		finalizeRun: mockFinalizeRun,
	};
});

useAuthSetup();
useConsoleSpy();

const actor = {
	id: 'actor-id',
	name: 'some-actor',
	username: 'someone',
	versions: [{ versionNumber: '0.0', buildTag: 'latest' }],
	taggedBuilds: { latest: { buildId: 'build-id', buildNumber: '0.0.1' } },
};

const task = { id: 'task-id', name: 'some-task', title: 'Some Task' };

const run = {
	id: 'run-id',
	status: 'SUCCEEDED',
	startedAt: new Date('2024-01-01T00:00:00Z'),
	buildNumber: '0.0.1',
	options: { timeoutSecs: 0, memoryMbytes: 1024 },
	defaultDatasetId: 'dataset-id',
};

const fakeClient = () =>
	({
		actor: () => ({ get: async () => actor }),
		task: () => ({ get: async () => task }),
	}) as unknown as ApifyClient;

beforeEach(() => {
	mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient());
	mockGetCurrentUserInfo.mockResolvedValue({ id: 'user-id', username: 'someone' });
	mockRunActorOrTaskOnCloud.mockImplementation(async function* () {
		yield run;
	});
	mockFinalizeRun.mockResolvedValue(undefined);
});

afterEach(() => {
	mockGetLoggedClientOrThrow.mockReset();
	mockGetCurrentUserInfo.mockReset();
	mockRunActorOrTaskOnCloud.mockReset();
	mockFinalizeRun.mockReset();
});

function sentRunOptions(): RunOnCloudOptions['runOptions'] {
	expect(mockRunActorOrTaskOnCloud).toHaveBeenCalledTimes(1);
	return (mockRunActorOrTaskOnCloud.mock.calls[0][1] as RunOnCloudOptions).runOptions;
}

const commands = [
	{ name: 'apify call', command: ActorsCallCommand, args: { args_actorId: 'someone/some-actor' } },
	{ name: 'apify actors start', command: ActorsStartCommand, args: { args_actorId: 'someone/some-actor' } },
	{ name: 'apify task run', command: TaskRunCommand, args: { args_taskId: 'some-task' } },
] as const;

describe.each(commands)('$name --timeout', ({ command, args }) => {
	it('sends --timeout 0 as a zero timeout (no timeout), not as an omitted option', async () => {
		await testRunCommand(command as never, { ...args, flags_timeout: 0 } as never);

		expect(sentRunOptions()).toMatchObject({ timeout: 0 });
	});

	it('sends a positive --timeout as is', async () => {
		await testRunCommand(command as never, { ...args, flags_timeout: 120 } as never);

		expect(sentRunOptions()).toMatchObject({ timeout: 120 });
	});

	it("leaves the timeout to the Actor's default when the flag is omitted", async () => {
		await testRunCommand(command as never, { ...args } as never);

		expect(sentRunOptions()).not.toHaveProperty('timeout');
	});
});
