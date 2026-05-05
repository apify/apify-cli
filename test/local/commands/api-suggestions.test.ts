import { ApiCommand } from '../../../src/commands/api.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { MOCK_OPENAPI_SPEC } from '../../__setup__/fixtures/mock-openapi-spec.js';

const mockGetLoggedClientOrThrow = vitest.fn();

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
	};
});

useAuthSetup();

const { lastErrorMessage, logMessages } = useConsoleSpy();

afterEach(() => {
	mockGetLoggedClientOrThrow.mockReset();
});

describe('apify api 404 suggestions', () => {
	it('should show "did you mean" suggestions on a 404 response', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue({
			token: 'test-token',
			baseUrl: 'https://api.apify.com/v2',
		});

		const fetchSpy = vitest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

			if (url.includes('openapi.json')) {
				return new Response(JSON.stringify(MOCK_OPENAPI_SPEC), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			// API call returns 404
			return new Response(JSON.stringify({ error: { message: 'Not found' } }), {
				status: 404,
				statusText: 'Not Found',
			});
		});

		try {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'actors',
			});

			const combined = logMessages.error.join('\n');
			expect(combined).toMatch(/404/);
			expect(combined).toMatch(/did you mean/i);
			expect(combined).toMatch(/--list-endpoints/);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('should fall back to static hint when the spec fetch fails', async () => {
		mockGetLoggedClientOrThrow.mockResolvedValue({
			token: 'test-token',
			baseUrl: 'https://api.apify.com/v2',
		});

		const fetchSpy = vitest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

			if (url.includes('openapi.json')) {
				throw new Error('Network error');
			}

			return new Response(JSON.stringify({ error: { message: 'Not found' } }), {
				status: 404,
				statusText: 'Not Found',
			});
		});

		try {
			await testRunCommand(ApiCommand, {
				args_methodOrEndpoint: 'nonexistent',
			});

			const combined = logMessages.error.join('\n');
			expect(combined).toMatch(/404/);
			expect(combined).toMatch(/--list-endpoints/);
			// Should NOT show "did you mean" since spec fetch failed
			expect(combined).not.toMatch(/did you mean/i);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
