import type { ApifyClient } from 'apify-client';

import { ActorsLsCommand } from '../../../src/commands/actors/ls.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
}));

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
	};
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

const listItem = {
	id: 'abc123',
	createdAt: new Date('2024-01-01T00:00:00Z'),
	modifiedAt: new Date('2024-01-02T00:00:00Z'),
	name: 'some-actor',
	username: 'someone-else',
	title: 'Some Actor',
	stats: { totalRuns: 3, lastRunStartedAt: '2024-01-02T00:00:00Z' },
};

// The API omits `stats` on some Actor records even though apify-client types it as required.
const actorWithoutStats = {
	id: 'abc123',
	name: 'some-actor',
	username: 'someone-else',
	title: 'Some Actor',
	defaultRunOptions: { build: 'latest', timeoutSecs: 3600, memoryMbytes: 1024 },
};

const fakeClient = () =>
	({
		actors: () => ({
			list: async () => ({ count: 1, desc: false, items: [listItem], limit: 20, offset: 0, total: 1 }),
		}),
		actor: () => ({
			get: async () => actorWithoutStats,
			runs: () => ({
				list: async () => ({ count: 0, desc: true, items: [], limit: 1, offset: 0, total: 0 }),
			}),
		}),
	}) as unknown as ApifyClient;

afterEach(() => {
	mockGetLoggedClientOrThrow.mockReset();
});

describe('apify actors ls', () => {
	it('renders the table when an Actor record has no stats', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient());

		await testRunCommand(ActorsLsCommand, { flags_my: true });

		expect(logMessages.error).toEqual([]);
		expect(logMessages.log.join('\n')).toContain('Some Actor');
	});
});
