import type { ApifyClient } from 'apify-client';

import { BuildsInfoCommand } from '../../../../src/commands/builds/info.js';
import { BuildsLogCommand } from '../../../../src/commands/builds/log.js';
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
// `userId` and `meta.origin` stay, the build internals such as `options` and `stats` don't.
const reducedBuild = {
	meta: { origin: 'CLI' },
	id: 'buildId',
	actId: 'actorId',
	userId: 'userId',
	buildNumber: '1.0.30',
	status: 'FAILED',
	startedAt: new Date('2026-01-01T10:00:00.000Z'),
	finishedAt: new Date('2026-01-01T10:01:05.000Z'),
};

const fakeClient = {
	actor: () => ({
		get: async () => ({
			id: 'actorId',
			name: 'some-actor',
			username: 'someone-else',
			taggedBuilds: { latest: { buildId: 'buildId', buildNumber: '1.0.30' } },
			versions: [{ versionNumber: '1.0', buildTag: 'latest' }],
		}),
	}),
	build: () => ({ get: async () => reducedBuild }),
	log: () => ({ get: async () => undefined }),
} as unknown as ApifyClient;

// The command framework records a thrown error on the real `process`; put it back so it cannot leak.
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
	originalExitCode = process.exitCode;
	mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient);
});

afterEach(() => {
	process.exitCode = originalExitCode;
});

describe('builds commands with a reduced build', () => {
	it('builds info omits the lines whose data is missing', async () => {
		await testRunCommand(BuildsInfoCommand, { args_buildId: 'buildId' });

		const output = logMessages.log.join('\n');

		expect(logMessages.error).toEqual([]);
		expect(output).toContain('Build Number: 1.0.30');
		expect(output).toContain('Status: Failed');
		expect(output).toContain('took 1 minute 5 seconds');
		expect(output).not.toContain('Compute Units');
		expect(output).not.toContain('Docker Image Size');
		expect(output).toContain('Origin: CLI');
	});

	it('builds log says the user has no access to the log', async () => {
		await testRunCommand(BuildsLogCommand, { args_buildId: 'buildId' });

		const errors = logMessages.error.join('\n');

		expect(errors).toContain(`You don't have access to the log of build with ID "buildId".`);
		expect(errors).not.toContain('was not found');
	});

	it('builds wait reports the missing log access as the reason', async () => {
		await testRunCommand(BuildsWaitCommand, { args_buildId: 'buildId' });

		expect(logMessages.log.join('\n')).toContain("You don't have access to this build's log.");
	});
});
