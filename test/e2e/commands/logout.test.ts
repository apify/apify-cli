import { randomBytes } from 'node:crypto';

import { runCli } from '../__helpers__/run-cli.js';

describe('[e2e] apify logout', () => {
	const authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-logout-${randomBytes(6).toString('hex')}` };

	it('logs out successfully even when not logged in', async () => {
		const result = await runCli('apify', ['logout'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('You are logged out from your Apify account');
	});
});
