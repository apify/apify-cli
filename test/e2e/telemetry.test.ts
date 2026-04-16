import { randomBytes } from 'node:crypto';

import { runCli } from './__helpers__/run-cli.js';

describe('[e2e] apify telemetry enable/disable', () => {
	const authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-telemetry-${randomBytes(6).toString('hex')}` };

	it('disables telemetry', async () => {
		const result = await runCli('apify', ['telemetry', 'disable'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		// Output goes to stderr and contains either "Telemetry disabled" or "already disabled"
		expect(result.stderr).toMatch(/Telemetry disabled|already disabled/i);
	});

	it('enables telemetry', async () => {
		const result = await runCli('apify', ['telemetry', 'enable'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		// Output goes to stderr and contains either "Telemetry enabled" or "already enabled"
		expect(result.stderr).toMatch(/Telemetry enabled|already enabled/i);
	});
});
