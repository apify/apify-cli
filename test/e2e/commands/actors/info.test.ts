import { randomBytes } from 'node:crypto';

import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] actors info', () => {
	let authEnv: Record<string, string>;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for actors info tests');

		const authPath = `e2e-actors-info-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}
	});

	it('shows info for a public actor (--json)', async () => {
		const result = await runCli('apify', ['actors', 'info', 'apify/web-scraper', '--json'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.name).toBe('web-scraper');
	});

	it('shows README with --readme flag', async () => {
		const result = await runCli('apify', ['actors', 'info', 'apify/web-scraper', '--readme'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout.length).toBeGreaterThan(0);
	});

	it('shows input schema with --input flag', async () => {
		const result = await runCli('apify', ['actors', 'info', 'apify/rag-web-browser', '--input'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(() => JSON.parse(result.stdout)).not.toThrow();
	});

	it('fails with invalid actor ID', async () => {
		const result = await runCli('apify', ['actors', 'info', 'nonexistent/actor-xyz'], { env: authEnv });

		expect(result.stdout).toContain('was not found');
	});
});
