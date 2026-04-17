import { ApiCommand } from '../../../src/commands/api.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { lastErrorMessage, logMessages } = useConsoleSpy();

describe('apify api (local)', () => {
	describe('--params validation', () => {
		it('should error on invalid JSON', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_params: '{not valid json',
			});

			expect(lastErrorMessage()).toMatch(/invalid json in --params/i);
		});

		it('should error when --params is not an object', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_params: '[1, 2, 3]',
			});

			expect(lastErrorMessage()).toMatch(/--params must be a json object/i);
		});

		it('should error on nested object values', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_params: JSON.stringify({ filter: { status: 'SUCCEEDED' } }),
			});

			expect(lastErrorMessage()).toMatch(/must be a scalar/i);
			expect(lastErrorMessage()).toContain('filter');
		});

		it('should error on nested array values', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_params: JSON.stringify({ ids: ['a', 'b'] }),
			});

			expect(lastErrorMessage()).toMatch(/must be a scalar/i);
		});
	});

	describe('--body validation', () => {
		it('should error on invalid JSON', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/acts',
				flags_method: 'POST',
				flags_body: '{name: "no quotes"}',
			});

			expect(lastErrorMessage()).toMatch(/invalid json in --body/i);
		});
	});

	describe('--header validation', () => {
		it('should error when format has no colon', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_header: 'X-Missing-Colon',
			});

			expect(lastErrorMessage()).toMatch(/header must be in "key:value" format/i);
		});

		it('should error on invalid JSON object', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_header: '{not valid json',
			});

			expect(lastErrorMessage()).toMatch(/invalid json in --header/i);
		});

		it('should error when JSON header value is not a string', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_header: JSON.stringify({ 'X-Count': 42 }),
			});

			expect(lastErrorMessage()).toMatch(/must be a string/i);
		});

		it('should accept JSON object with multiple headers (proceeds past validation)', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_header: JSON.stringify({ 'X-Foo': 'bar', 'X-Baz': 'qux' }),
			});

			// Not a validation error; should fall through to "not logged in"
			expect(lastErrorMessage()).toMatch(/you are not logged in/i);
		});
	});

	describe('method handling', () => {
		it('should error when positional method conflicts with --method flag', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'GET',
				args_endpoint: 'v2/users/me',
				flags_method: 'POST',
			});

			expect(lastErrorMessage()).toMatch(/conflicting http methods/i);
			expect(lastErrorMessage()).toContain('GET');
			expect(lastErrorMessage()).toContain('POST');
		});

		it('should accept matching positional method and --method flag', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'GET',
				args_endpoint: 'v2/users/me',
				flags_method: 'GET',
			});

			// Passes validation; reaches auth check
			expect(lastErrorMessage()).toMatch(/you are not logged in/i);
		});
	});

	describe('--list-endpoints', () => {
		it('should list endpoints without requiring auth', async () => {
			await testRunCommand(ApiCommand, {
				flags_listEndpoints: true,
			});

			expect(logMessages.log.length).toBeGreaterThan(0);
			const combined = logMessages.log.join('\n');
			expect(combined).toMatch(/\/v2\//);
			expect(combined).toMatch(/\b(GET|POST|PUT|PATCH|DELETE)\b/);
		});
	});
});
