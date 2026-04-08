import { ApiCommand } from '../../../src/commands/api.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { lastErrorMessage, logSpy, errorSpy } = useConsoleSpy();

describe('[api] apify api', () => {
	it('should fail when not logged in', async () => {
		await testRunCommand(ApiCommand, {
			args_endpoint: 'v2/users/me',
		});

		expect(lastErrorMessage()).toMatch(/you are not logged in/i);
	});

	it('should GET v2/users/me', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_endpoint: 'v2/users/me',
		});

		const spy = logSpy();
		expect(spy).toHaveBeenCalled();

		const output = spy.mock.calls[0][0];
		const parsed = JSON.parse(output);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
		expect(parsed.data.username).toBeDefined();
	});

	it('should normalize endpoint with leading slash', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_endpoint: '/v2/users/me',
		});

		const spy = logSpy();
		expect(spy).toHaveBeenCalled();

		const output = spy.mock.calls[0][0];
		const parsed = JSON.parse(output);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.id).toBeDefined();
	});

	it('should set exit code for non-existent endpoint', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_endpoint: 'v2/acts/this-actor-does-not-exist-at-all-12345',
		});

		expect(process.exitCode).toBe(1);

		const spy = errorSpy();
		expect(spy).toHaveBeenCalled();
	});

	it('should work with custom header', async () => {
		await safeLogin();

		await testRunCommand(ApiCommand, {
			args_endpoint: 'v2/users/me',
			flags_header: 'X-Custom-Test:hello',
		});

		const spy = logSpy();
		expect(spy).toHaveBeenCalled();

		const output = spy.mock.calls[0][0];
		const parsed = JSON.parse(output);

		expect(parsed.data.id).toBeDefined();
	});

	it('should support POST with --body', async () => {
		await safeLogin();

		const actorName = `test-api-cmd-${Date.now()}`;

		// Create an actor via POST
		await testRunCommand(ApiCommand, {
			args_endpoint: 'v2/acts',
			flags_method: 'POST',
			flags_body: JSON.stringify({ name: actorName, title: 'Test API Command' }),
		});

		const spy = logSpy();
		expect(spy).toHaveBeenCalled();

		const output = spy.mock.calls[0][0];
		const parsed = JSON.parse(output);

		expect(parsed.data).toBeDefined();
		expect(parsed.data.name).toBe(actorName);

		// Cleanup — delete the created actor
		const actorId = parsed.data.id;

		await testRunCommand(ApiCommand, {
			args_endpoint: `v2/acts/${actorId}`,
			flags_method: 'DELETE',
		});
	});
});
