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
});
