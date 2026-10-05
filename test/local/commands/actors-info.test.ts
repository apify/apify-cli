import type { ApifyClient } from 'apify-client';

import { ActorsInfoCommand } from '../../../src/commands/actors/info.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow, mockGetCurrentUserInfo } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
	mockGetCurrentUserInfo: vitest.fn(),
}));

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
		getCurrentUserInfo: mockGetCurrentUserInfo,
	};
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

const defaultBuild = {
	buildNumber: '1.0.30',
	readme: 'default build readme',
	inputSchema: '{"title":"default build schema"}',
};

const fakeClient = ({ taggedBuilds, defaultBuildResult }: { taggedBuilds: object; defaultBuildResult?: object }) =>
	({
		actor: () => ({
			get: async () => ({
				id: 'actorId',
				name: 'some-actor',
				username: 'someone-else',
				userId: 'userId',
				taggedBuilds,
				defaultRunOptions: { build: 'version-1' },
			}),
			defaultBuild: async () => {
				if (!defaultBuildResult) throw new Error('Default build not found');
				return { get: async () => defaultBuildResult };
			},
		}),
		user: () => ({ get: async () => ({ username: 'someone-else', profile: {} }) }),
		build: () => ({ get: async () => ({ readme: 'tagged build readme', inputSchema: '{"title":"tagged"}' }) }),
	}) as unknown as ApifyClient;

beforeEach(() => {
	mockGetCurrentUserInfo.mockResolvedValue({ id: 'userId', username: 'someone-else' });
});

afterEach(() => {
	mockGetLoggedClientOrThrow.mockReset();
	mockGetCurrentUserInfo.mockReset();
});

describe('apify actors info', () => {
	it('prints the default build input schema when the Actor has no latest tag', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(
			fakeClient({
				taggedBuilds: { 'version-1': { buildId: 'b1', buildNumber: '1.0.30' } },
				defaultBuildResult: defaultBuild,
			}),
		);

		await testRunCommand(ActorsInfoCommand, { args_actorId: 'someone-else/some-actor', flags_input: true });

		expect(logMessages.error).toEqual([]);
		expect(logMessages.log.join('\n')).toBe(defaultBuild.inputSchema);
	});

	it('prefers the default build README over the latest tag', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(
			fakeClient({
				taggedBuilds: {
					latest: { buildId: 'b0', buildNumber: '0.0.32' },
					'version-1': { buildId: 'b1', buildNumber: '1.0.30' },
				},
				defaultBuildResult: defaultBuild,
			}),
		);

		await testRunCommand(ActorsInfoCommand, { args_actorId: 'someone-else/some-actor', flags_readme: true });

		expect(logMessages.log.join('\n')).toBe(defaultBuild.readme);
	});

	it('falls back to the latest tag when the default build cannot be resolved', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue(
			fakeClient({ taggedBuilds: { latest: { buildId: 'b0', buildNumber: '0.0.32' } } }),
		);

		await testRunCommand(ActorsInfoCommand, { args_actorId: 'someone-else/some-actor', flags_input: true });

		expect(logMessages.log.join('\n')).toBe('{"title":"tagged"}');
	});
});
