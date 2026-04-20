import { randomBytes } from 'node:crypto';

import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] auth login & token', () => {
	const authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-login-${randomBytes(6).toString('hex')}` };

	it('logs in with a valid token', async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required');

		const result = await runCli('apify', ['login', '--token', token], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('You are logged in to Apify as');
	});

	it('fails with an invalid token', async () => {
		const badAuthEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-badlogin-${randomBytes(6).toString('hex')}` };

		const result = await runCli('apify', ['login', '--token', 'invalid-token-abc'], { env: badAuthEnv });

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('Login to Apify failed');
	});

	it('prints the current token after login', async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required');

		// Ensure we're logged in
		await runCli('apify', ['login', '--token', token], { env: authEnv });

		const result = await runCli('apify', ['auth', 'token'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout.trim().length).toBeGreaterThan(0);
	});
});
