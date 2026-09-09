import type { ApifyClient } from 'apify-client';

import { runActorOrTaskOnCloud } from '../../../src/lib/commands/run-on-cloud.js';

const fakeClientThatThrows = (error: unknown) =>
	({
		actor: () => ({
			start: async () => {
				throw error;
			},
		}),
	}) as unknown as ApifyClient;

const callAndCatch = async (apiError: unknown) => {
	const iterator = runActorOrTaskOnCloud(fakeClientThatThrows(apiError), {
		actorOrTaskData: { id: 'abc', userFriendlyId: 'apify/test-actor' },
		runOptions: {},
		type: 'Actor',
		silent: true,
	});

	try {
		for await (const _ of iterator) {
			// drain
		}
	} catch (err) {
		return err as Error;
	}

	throw new Error('Expected runActorOrTaskOnCloud to throw');
};

describe('runActorOrTaskOnCloud', () => {
	it('surfaces approval URL when Actor requires full account access', async () => {
		const approvalUrl = 'https://console.apify.com/actors/abc?approvePermissions=true';
		const apiError = Object.assign(new Error('This Actor requires full access to your account.'), {
			type: 'full-permission-actor-not-approved',
			data: { approvalUrl },
		});

		const err = await callAndCatch(apiError);

		expect(err.message).toMatch(/has not been approved yet/);
		expect(err.message).toContain(approvalUrl);
	});

	it('falls back to bare message when API response has no approvalUrl', async () => {
		const apiError = Object.assign(new Error('This Actor requires full access to your account.'), {
			type: 'full-permission-actor-not-approved',
		});

		const err = await callAndCatch(apiError);

		expect(err.message).toMatch(/has not been approved yet/);
		expect(err.message).not.toMatch(/Approve here/);
	});

	describe('extraStartParams (local Actor runtime extensions)', () => {
		const startedRun = { id: 'run1', status: 'RUNNING' };
		const fetchedRun = { id: 'run1', status: 'RUNNING', startedAt: new Date(0) };

		const fakeClient = () => {
			const start = vitest.fn();
			const call = vitest.fn(async () => ({ data: { data: startedRun } }));
			const client = {
				httpClient: { call },
				actor: () => ({ url: 'http://localhost:3333/v2/actors/abc', start }),
				run: () => ({ get: async () => fetchedRun }),
			} as unknown as ApifyClient;
			return { client, start, call };
		};

		const startOnce = async (client: ApifyClient, extraStartParams?: Record<string, string>) => {
			const iterator = runActorOrTaskOnCloud(client, {
				actorOrTaskData: { id: 'abc', userFriendlyId: 'apify/test-actor' },
				runOptions: { waitForFinish: 2, build: 'latest', memory: 256 },
				inputOverride: { url: 'https://example.com' },
				type: 'Actor',
				silent: true,
				suppressFinalStatus: true,
				extraStartParams,
			});
			const { value } = await iterator.next();
			await iterator.return(undefined);
			return value;
		};

		it('starts the run through a raw request carrying the standard options plus the extras, then re-reads it', async () => {
			const { client, start, call } = fakeClient();

			const run = await startOnce(client, { devFolder: 'false' });

			expect(start).not.toHaveBeenCalled();
			expect(call).toHaveBeenCalledTimes(1);
			expect(call.mock.calls[0][0 as never]).toMatchObject({
				url: 'http://localhost:3333/v2/actors/abc/runs',
				method: 'POST',
				data: { url: 'https://example.com' },
				headers: { 'content-type': 'application/json' },
				params: { waitForFinish: 2, build: 'latest', memory: 256, devFolder: 'false' },
			});
			expect(run).toBe(fetchedRun);
		});

		it("uses apify-client's own start() when there are no extras", async () => {
			const { client, start, call } = fakeClient();
			start.mockResolvedValue(fetchedRun);

			await startOnce(client);

			expect(call).not.toHaveBeenCalled();
			expect(start).toHaveBeenCalledTimes(1);
		});
	});
});
