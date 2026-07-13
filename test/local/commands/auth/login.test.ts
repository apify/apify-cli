import process from 'node:process';

import { getLoginApiBaseUrl } from '../../../../src/commands/auth/login.js';

describe('getLoginApiBaseUrl', () => {
	const originalConsoleUrl = process.env.APIFY_CONSOLE_URL;
	const originalClientBaseUrl = process.env.APIFY_CLIENT_BASE_URL;

	afterEach(() => {
		if (originalConsoleUrl === undefined) delete process.env.APIFY_CONSOLE_URL;
		else process.env.APIFY_CONSOLE_URL = originalConsoleUrl;

		if (originalClientBaseUrl === undefined) delete process.env.APIFY_CLIENT_BASE_URL;
		else process.env.APIFY_CLIENT_BASE_URL = originalClientBaseUrl;
	});

	it('returns undefined for the production Console (client falls back to the default API)', () => {
		delete process.env.APIFY_CONSOLE_URL;
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getLoginApiBaseUrl()).toBeUndefined();
	});

	it('defaults to the local API when the Console is a localhost instance', () => {
		process.env.APIFY_CONSOLE_URL = 'http://localhost:3000';
		delete process.env.APIFY_CLIENT_BASE_URL;

		expect(getLoginApiBaseUrl()).toBe('http://localhost:3333');
	});

	it('lets an explicit APIFY_CLIENT_BASE_URL override the localhost default', () => {
		process.env.APIFY_CONSOLE_URL = 'http://localhost:3000';
		process.env.APIFY_CLIENT_BASE_URL = 'http://localhost:9999';

		expect(getLoginApiBaseUrl()).toBe('http://localhost:9999');
	});

	it('honors an explicit APIFY_CLIENT_BASE_URL even against the production Console', () => {
		delete process.env.APIFY_CONSOLE_URL;
		process.env.APIFY_CLIENT_BASE_URL = 'https://api.apify-staging.com';

		expect(getLoginApiBaseUrl()).toBe('https://api.apify-staging.com');
	});
});
