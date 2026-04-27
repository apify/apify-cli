import { randomBytes } from 'node:crypto';

import { runCli } from '../__helpers__/run-cli.js';

describe('[e2e][api] account info', () => {
	const authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-info-${randomBytes(6).toString('hex')}` };

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for info tests');

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}
	});

	it('prints account details', async () => {
		const result = await runCli('apify', ['info'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('username:');
		expect(result.stdout).toContain('userId:');
	});

	it('fails when not logged in', async () => {
		const noAuthEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-noauth-${randomBytes(6).toString('hex')}` };

		const result = await runCli('apify', ['info'], { env: noAuthEnv });

		expect(result.exitCode).not.toBe(0);
	});
});
