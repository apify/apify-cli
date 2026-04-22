import { ApiCommand } from '../../../src/commands/api.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { lastErrorMessage, logMessages, errorSpy } = useConsoleSpy();

describe('[api] apify api', () => {
	beforeEach(() => {
		process.exitCode = 0;
	});

	it('should fail when not logged in', async () => {
		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'v2/users/me',
		});

		expect(lastErrorMessage()).toMatch(/you are not logged in/i);
	});

	it('should GET v2/users/me', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'v2/users/me',
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
		expect(parsed.data.username).toBeDefined();
	});

	it('should normalize endpoint with leading slash', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: '/v2/users/me',
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
	});

	it('should auto-prepend v2/ prefix when omitted', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'users/me',
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
		expect(parsed.data.username).toBeDefined();
	});

	it('should set exit code for non-existent endpoint', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'v2/acts/this-actor-does-not-exist-at-all-12345',
		});

		expect(process.exitCode).toBe(1);

		const spy = errorSpy();
		expect(spy).toHaveBeenCalled();
	});

	it('should work with custom header', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'v2/users/me',
			flags_header: 'X-Custom-Test:hello',
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data.id).toBeDefined();
	});

	it('should support positional HTTP method before endpoint', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'GET',
			args_endpoint: 'v2/users/me',
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
		expect(parsed.data.username).toBeDefined();
	});

	it('should support --params flag for query parameters', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_methodOrEndpoint: 'v2/actor-runs',
			flags_params: JSON.stringify({ limit: 1, desc: true }),
		});

		expect(logMessages.log.length).toBeGreaterThan(0);

		const parsed = JSON.parse(logMessages.log[0]);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.items).toBeDefined();
		expect(parsed.data.items.length).toBeLessThanOrEqual(1);
	});

	it('should support POST with --body', async () => {
		await safeLogin();

		const actorName = `test-api-cmd-${Date.now()}`;
		let actorId: string | undefined;

		try {
			// Create an actor via POST
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/acts',
				flags_method: 'POST',
				flags_body: JSON.stringify({ name: actorName, title: 'Test API Command' }),
			});

			expect(logMessages.log.length).toBeGreaterThan(0);

			const parsed = JSON.parse(logMessages.log[0]);

			// Capture the id before making assertions so cleanup still runs if one fails.
			actorId = parsed?.data?.id;

			expect(parsed.data).toBeDefined();
			expect(parsed.data.name).toBe(actorName);
		} finally {
			// Cleanup — delete the created actor even if assertions fail
			if (actorId) {
				await testRunCommand(ApiCommand, {
					args_methodOrEndpoint: `v2/acts/${actorId}`,
					flags_method: 'DELETE',
				});
			}
		}
	});
});
