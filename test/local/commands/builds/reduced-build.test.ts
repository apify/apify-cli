import type { ApifyClient } from 'apify-client';

import { BuildsInfoCommand } from '../../../../src/commands/builds/info.js';
import { BuildsLogCommand } from '../../../../src/commands/builds/log.js';
import { BuildsLsCommand } from '../../../../src/commands/builds/ls.js';
import { BuildsWaitCommand } from '../../../../src/commands/builds/wait.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
}));

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
	};
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

// What the API returns to users who can read the Actor but can neither write to it nor build it.
const reducedBuild = {
	id: 'buildId',
	actId: 'actorId',
	buildNumber: '1.0.30',
	status: 'FAILED',
	startedAt: new Date('2026-01-01T10:00:00.000Z'),
	finishedAt: new Date('2026-01-01T10:01:05.000Z'),
};

const fullBuild = {
	...reducedBuild,
	meta: { origin: 'CLI' },
	stats: { durationMillis: 65_000, computeUnits: 0.0123, imageSizeBytes: 1024 * 1024 },
};

const fakeClient = ({ build, log }: { build: object; log?: string }) =>
	({
		actor: () => ({
			get: async () => ({
				id: 'actorId',
				name: 'some-actor',
				username: 'someone-else',
				taggedBuilds: { latest: { buildId: 'buildId', buildNumber: '1.0.30' } },
				versions: [{ versionNumber: '1.0', buildTag: 'latest' }],
			}),
			builds: () => ({ list: async () => ({ total: 1, items: [build] }) }),
		}),
		build: () => ({ get: async () => build }),
		log: () => ({ get: async () => log }),
	}) as unknown as ApifyClient;

// The command framework records a thrown error on the real `process`; put it back so it cannot leak.
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
	originalExitCode = process.exitCode;
});

afterEach(() => {
	process.exitCode = originalExitCode;
	mockGetLoggedClientOrThrow.mockReset();
});

describe('builds commands with a reduced build', () => {
	it('builds info omits the lines whose data is missing', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: reducedBuild }));

		await testRunCommand(BuildsInfoCommand, { args_buildId: 'buildId' });

		const output = logMessages.log.join('\n');

		expect(logMessages.error).toEqual([]);
		expect(output).toContain('Build Number: 1.0.30');
		expect(output).toContain('Status: Failed');
		expect(output).toContain('Finished:');
		expect(output).not.toContain('took');
		expect(output).not.toContain('Compute Units');
		expect(output).not.toContain('Docker Image Size');
		expect(output).not.toContain('Origin');
	});

	it('builds info still prints every line for a full build', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: fullBuild }));

		await testRunCommand(BuildsInfoCommand, { args_buildId: 'buildId' });

		const output = logMessages.log.join('\n');

		expect(output).toContain('took');
		expect(output).toContain('Compute Units: 0.012');
		expect(output).toContain('Docker Image Size');
		expect(output).toContain('Origin: CLI');
	});

	it('builds log says the user has no access to the log', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: reducedBuild }));

		await testRunCommand(BuildsLogCommand, { args_buildId: 'buildId' });

		const errors = logMessages.error.join('\n');

		expect(errors).toContain(`You don't have access to the log of build with ID "buildId".`);
		expect(errors).not.toContain('was not found');
	});

	it('builds log stays quiet when a full build has no log', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: fullBuild }));

		await testRunCommand(BuildsLogCommand, { args_buildId: 'buildId' });

		expect(logMessages.error.join('\n')).not.toContain("don't have access");
	});

	it('builds wait reports the missing log access as the reason', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: reducedBuild }));

		await testRunCommand(BuildsWaitCommand, { args_buildId: 'buildId' });

		expect(logMessages.log.join('\n')).toContain("You don't have access to this build's log.");
	});

	it('builds ls renders reduced rows', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient({ build: reducedBuild }));

		await testRunCommand(BuildsLsCommand, { args_actorId: 'someone-else/some-actor' });

		const output = logMessages.log.join('\n');

		expect(logMessages.error).toEqual([]);
		expect(output).toContain('1.0.30');
		expect(output).toContain('buildId');
		expect(output).toContain('1m 5s');
	});
});
