import process from 'node:process';

import { getConsoleUrl } from '../../../src/lib/console-url.js';

describe('getConsoleUrl', () => {
	const originalConsoleUrl = process.env.APIFY_CONSOLE_URL;
	const originalClientBaseUrl = process.env.APIFY_CLIENT_BASE_URL;

	afterEach(() => {
		if (originalConsoleUrl === undefined) delete process.env.APIFY_CONSOLE_URL;
		else process.env.APIFY_CONSOLE_URL = originalConsoleUrl;

		if (originalClientBaseUrl === undefined) delete process.env.APIFY_CLIENT_BASE_URL;
		else process.env.APIFY_CLIENT_BASE_URL = originalClientBaseUrl;
	});

	it('defaults to the production Console when no env override is set', () => {
		delete process.env.APIFY_CONSOLE_URL;
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});

	it('derives the Console URL from APIFY_CLIENT_BASE_URL by swapping the api host', () => {
		delete process.env.APIFY_CONSOLE_URL;
		process.env.APIFY_CLIENT_BASE_URL = 'https://api.apify-staging.com';

		expect(getConsoleUrl()).toBe('https://console.apify-staging.com');
	});

	it('drops the API path (such as /v2) when deriving from APIFY_CLIENT_BASE_URL', () => {
		delete process.env.APIFY_CONSOLE_URL;
		process.env.APIFY_CLIENT_BASE_URL = 'https://api.apify.com/v2';

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});

	it('prefers the explicit APIFY_CONSOLE_URL override', () => {
		process.env.APIFY_CONSOLE_URL = 'http://localhost:3000';
		process.env.APIFY_CLIENT_BASE_URL = 'http://localhost:3333';

		expect(getConsoleUrl()).toBe('http://localhost:3000');
	});

	it('strips a trailing slash from the explicit override', () => {
		process.env.APIFY_CONSOLE_URL = 'https://console.apify.com/';
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});

	it('falls back to the production Console when APIFY_CLIENT_BASE_URL is malformed', () => {
		delete process.env.APIFY_CONSOLE_URL;
		process.env.APIFY_CLIENT_BASE_URL = 'not a url';

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});
});
