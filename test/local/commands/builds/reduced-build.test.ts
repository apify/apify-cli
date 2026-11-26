import type { ApifyClient } from 'apify-client';

import { BuildsInfoCommand } from '../../../../src/commands/builds/info.js';
import { BuildsLogCommand } from '../../../../src/commands/builds/log.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
}));

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../src/lib/utils.js')>()),
	getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
}));

useAuthSetup();

const { logMessages } = useConsoleSpy();

// What the API returns to users who can read the Actor but can neither write to it nor build it.
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
	actor: () => ({ get: async () => undefined }),
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
	it('builds info computes the duration from the timestamps', async () => {
		await testRunCommand(BuildsInfoCommand, { args_buildId: 'buildId' });

		const output = logMessages.log.join('\n');

		expect(output).toContain('took 1 minute 5 seconds');
		expect(output).not.toContain('Compute Units');
	});

	it('builds log says the user has no access to the log', async () => {
		await testRunCommand(BuildsLogCommand, { args_buildId: 'buildId' });

		expect(logMessages.error.join('\n')).toContain(`You don't have access to the log of build with ID "buildId".`);
	});
});
