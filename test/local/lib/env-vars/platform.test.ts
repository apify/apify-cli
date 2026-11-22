import type { ApifyClient } from 'apify-client';

import { listPlatformEnvVars } from '../../../../src/lib/env-vars/platform.js';
import type { EnvTarget } from '../../../../src/lib/env-vars/target.js';

const targetListing = (items: Record<string, unknown>[]): EnvTarget => {
	const client = {
		actor: () => ({ version: () => ({ envVars: () => ({ list: async () => ({ total: items.length, items }) }) }) }),
	};

	return {
		client: client as unknown as ApifyClient,
		actorDir: '/actor',
		actor: { id: 'actor-1', username: 'tester', name: 'my-actor' },
		actorLabel: 'tester/my-actor',
		versionNumber: '0.0',
		versionSource: 'default',
	};
};

describe('listPlatformEnvVars', () => {
	it('drops the value of a secret even when the API returns one, and keeps the platform order', async () => {
		const envVars = await listPlatformEnvVars(
			targetListing([
				{ name: 'Z_PLAIN', value: 'plain-value', isSecret: false },
				{ name: 'A_SECRET', value: 's3cr3t-sentinel', valueHash: 'hash', isSecret: true },
				{ name: 'NO_TYPE', value: 'v' },
			]),
		);

		expect(envVars).toEqual([
			{ name: 'Z_PLAIN', isSecret: false, value: 'plain-value' },
			{ name: 'A_SECRET', isSecret: true },
			{ name: 'NO_TYPE', isSecret: false, value: 'v' },
		]);
		expect(JSON.stringify(envVars)).not.toContain('s3cr3t-sentinel');
	});

	it('gives a plain variable without a value an empty one', async () => {
		await expect(listPlatformEnvVars(targetListing([{ name: 'EMPTY', isSecret: false }]))).resolves.toEqual([
			{ name: 'EMPTY', isSecret: false, value: '' },
		]);
	});
});
