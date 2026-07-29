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

	it('uses the explicit APIFY_CONSOLE_URL override', () => {
		process.env.APIFY_CONSOLE_URL = 'http://localhost:3000';
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getConsoleUrl()).toBe('http://localhost:3000');
	});

	it('strips a trailing slash from the explicit override', () => {
		process.env.APIFY_CONSOLE_URL = 'https://console.apify.com/';
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});

	it('ignores APIFY_CLIENT_BASE_URL (the Console URL is not derived from the API URL)', () => {
		delete process.env.APIFY_CONSOLE_URL;
		process.env.APIFY_CLIENT_BASE_URL = 'https://api.apify-staging.com';

		expect(getConsoleUrl()).toBe('https://console.apify.com');
	});
});
