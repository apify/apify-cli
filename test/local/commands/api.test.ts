import { ApiCommand } from '../../../src/commands/api.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { mockFetchSpec } from '../../__setup__/fixtures/mock-openapi-spec.js';

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

		it('should error when --body is used with GET (default method)', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_body: '{}',
			});

			expect(lastErrorMessage()).toMatch(/http get requests cannot have a request body/i);
		});

		it('should error when --body is used with a positional GET method', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'GET',
				args_endpoint: 'v2/users/me',
				flags_body: '{}',
			});

			expect(lastErrorMessage()).toMatch(/http get requests cannot have a request body/i);
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
		it('should fetch and list endpoints without requiring auth', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
				});

				expect(fetchSpy).toHaveBeenCalledWith('https://docs.apify.com/api/openapi.json');
				expect(logMessages.log.length).toBeGreaterThan(0);
				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/\/v2\/acts/);
				expect(combined).toMatch(/\/v2\/users\/me/);
				expect(combined).toMatch(/\b(GET|POST)\b/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should error when the OpenAPI spec download fails', async () => {
			const fetchSpy = vitest
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(new Response('nope', { status: 503, statusText: 'Service Unavailable' }));

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
				});

				expect(lastErrorMessage()).toMatch(/failed to download the apify openapi spec/i);
				expect(lastErrorMessage()).toMatch(/503/);
			} finally {
				fetchSpy.mockRestore();
			}
		});
	});

	describe('--search', () => {
		it('should error when used without --list-endpoints', async () => {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'v2/users/me',
				flags_search: 'actor',
			});

			expect(lastErrorMessage()).toMatch(/--search.*--list-endpoints/i);
		});

		it('should filter endpoints matching a single token', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
					flags_search: 'dataset',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/\/v2\/datasets/);
				expect(combined).not.toMatch(/\/v2\/acts\b/);
				expect(combined).not.toMatch(/\/v2\/users/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should filter endpoints matching multiple tokens (AND logic)', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
					flags_search: 'GET actor run',
				});

				const combined = logMessages.log.join('\n');
				// Should match "GET /v2/acts/{actorId}/runs" (summary: "Get list of Actor runs")
				// and "GET /v2/actor-runs/{runId}" (summary: "Get run")
				expect(combined).toMatch(/\/v2\/acts\/\{actorId\}\/runs/);
				// Should NOT match POST endpoints or unrelated ones
				expect(combined).not.toMatch(/\/v2\/datasets/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should print a message when no endpoints match', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
					flags_search: 'nonexistent-xyz',
				});

				expect(logMessages.log.length).toBe(0);
				expect(lastErrorMessage()).toMatch(/no endpoints matched/i);
				expect(lastErrorMessage()).toContain('nonexistent-xyz');
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should be case-insensitive', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_listEndpoints: true,
					flags_search: 'DELETE Dataset',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/DELETE/);
				expect(combined).toMatch(/\/v2\/datasets\/\{datasetId\}/);
			} finally {
				fetchSpy.mockRestore();
			}
		});
	});

	describe('--describe', () => {
		it('should describe an endpoint with exact path match', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_describe: 'acts/{actorId}',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/\/v2\/acts\/\{actorId\}/);
				expect(combined).toMatch(/GET/);
				expect(combined).toMatch(/PUT/);
				expect(combined).toMatch(/DELETE/);
				expect(combined).toMatch(/Get Actor/);
				expect(combined).toMatch(/Update Actor/);
				expect(combined).toMatch(/Path parameters/);
				expect(combined).toMatch(/actorId/);
				expect(combined).toMatch(/docs\.apify\.com/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should normalize input by stripping /v2/ prefix', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_describe: '/v2/actor-runs/{runId}',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/\/v2\/actor-runs\/\{runId\}/);
				expect(combined).toMatch(/Get run/);
				expect(combined).toMatch(/Delete run/);
				expect(combined).toMatch(/runId/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should show "did you mean" suggestions on no match', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_describe: 'actors',
				});

				const combined = logMessages.error.join('\n');
				expect(combined).toMatch(/no endpoint found/i);
				expect(combined).toMatch(/did you mean/i);
				expect(combined).toMatch(/--list-endpoints/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should show path params for endpoints with parameters', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_describe: 'acts/{actorId}/runs/{runId}',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/actorId/);
				expect(combined).toMatch(/runId/);
			} finally {
				fetchSpy.mockRestore();
			}
		});

		it('should describe an endpoint without path params', async () => {
			const fetchSpy = mockFetchSpec();

			try {
				await testRunCommand(ApiCommand, {
					flags_describe: 'users/me',
				});

				const combined = logMessages.log.join('\n');
				expect(combined).toMatch(/\/v2\/users\/me/);
				expect(combined).toMatch(/GET/);
				expect(combined).toMatch(/Get private user data/);
				expect(combined).not.toMatch(/Path parameters/);
			} finally {
				fetchSpy.mockRestore();
			}
		});
	});
});
