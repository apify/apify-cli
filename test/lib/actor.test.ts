import { APIFY_ENV_VARS } from '@apify/consts';
import { ApifyClient } from 'apify-client';

import { getApifyStorageClient } from '../../src/lib/actor.js';

beforeAll(() => {
	vitest.stubEnv(APIFY_ENV_VARS.IS_AT_HOME, 'true');
	vitest.stubEnv(APIFY_ENV_VARS.TOKEN, 'token for sure');
});

afterAll(() => {
	vitest.unstubAllEnvs();
});

describe('getApifyStorageClient should return a cloud instance when APIFY_IS_AT_HOME is set', () => {
	it('should return a cloud instance', async () => {
		await expect(getApifyStorageClient()).resolves.toBeInstanceOf(ApifyClient);
	});
});
