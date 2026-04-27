import { runCli } from '../__helpers__/run-cli.js';

describe('[e2e] --user-agent flag', () => {
	it('accepts --user-agent on any command without erroring', async () => {
		const result = await runCli('apify', ['help', '--user-agent', 'test-caller/1.0.0']);
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
	});

	it('accepts APIFY_CLI_USER_AGENT env var on any command without erroring', async () => {
		const result = await runCli('apify', ['help'], {
			env: { APIFY_CLI_USER_AGENT: 'test-caller/env-1.0.0' },
		});
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
	});

	it('rejects --user-agent without a value (string flag)', async () => {
		// Passing --user-agent with no value should surface a parseArgs error,
		// since the flag is declared as a string type.
		const result = await runCli('apify', ['help', '--user-agent']);
		expect(result.exitCode).not.toBe(0);
	});

	it('rejects --user-agent under the actor entrypoint', async () => {
		// The flag is scoped to the public apify entrypoint only — the actor
		// entrypoint runs inside Actor Docker images where caller-id is meaningless.
		const result = await runCli('actor', ['help', '--user-agent', 'foo']);
		expect(result.exitCode).not.toBe(0);
	});
});
