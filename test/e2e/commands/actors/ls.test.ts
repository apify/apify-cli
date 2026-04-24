import { randomBytes } from 'node:crypto';

import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] actors ls', () => {
	let authEnv: Record<string, string>;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for actors ls tests');

		const authPath = `e2e-actors-ls-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}
	});

	it('lists recent actors (--json)', async () => {
		const result = await runCli('apify', ['actors', 'ls', '--json'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(() => JSON.parse(result.stdout)).not.toThrow();
	});

	it('lists own actors with --my flag', async () => {
		const result = await runCli('apify', ['actors', 'ls', '--my', '--json'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(() => JSON.parse(result.stdout)).not.toThrow();
	});

	it('respects --limit flag', async () => {
		const result = await runCli('apify', ['actors', 'ls', '--my', '--limit', '5', '--json'], { env: authEnv });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(() => JSON.parse(result.stdout)).not.toThrow();
	});
});
