import { randomBytes } from 'node:crypto';

import { runCli } from './__helpers__/run-cli.js';

describe('[e2e] apify secrets add/ls/rm', () => {
	const authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: `e2e-secrets-${randomBytes(6).toString('hex')}` };

	it('full lifecycle: add, ls, rm', async () => {
		const secretName = `MY_SECRET_${randomBytes(4).toString('hex')}`;

		// Add a secret
		const addResult = await runCli('apify', ['secrets', 'add', secretName, 'my-value'], { env: authEnv });
		expect(addResult.exitCode, `stderr: ${addResult.stderr}`).toBe(0);

		// List secrets — should contain the secret name
		const lsResult = await runCli('apify', ['secrets', 'ls'], { env: authEnv });
		expect(lsResult.exitCode, `stderr: ${lsResult.stderr}`).toBe(0);
		expect(lsResult.stdout).toContain(secretName);

		// Remove the secret
		const rmResult = await runCli('apify', ['secrets', 'rm', secretName], { env: authEnv });
		expect(rmResult.exitCode, `stderr: ${rmResult.stderr}`).toBe(0);

		// List again — should NOT contain the secret name
		const lsAfterRm = await runCli('apify', ['secrets', 'ls'], { env: authEnv });
		expect(lsAfterRm.exitCode, `stderr: ${lsAfterRm.stderr}`).toBe(0);
		expect(lsAfterRm.stdout).not.toContain(secretName);
	});

	it('fails when adding a secret that already exists', async () => {
		const secretName = `DUP_SECRET_${randomBytes(4).toString('hex')}`;

		// Add first time
		const addResult = await runCli('apify', ['secrets', 'add', secretName, 'value1'], { env: authEnv });
		expect(addResult.exitCode, `stderr: ${addResult.stderr}`).toBe(0);

		// Add same secret again — should fail
		const dupResult = await runCli('apify', ['secrets', 'add', secretName, 'value2'], { env: authEnv });
		expect(dupResult.exitCode).not.toBe(0);
		expect(dupResult.stderr).toContain('already exists');

		// Cleanup
		await runCli('apify', ['secrets', 'rm', secretName], { env: authEnv });
	});
});
