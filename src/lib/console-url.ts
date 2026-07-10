import process from 'node:process';

const DEFAULT_CONSOLE_URL = 'https://console.apify.com';

/**
 * Resolves the base URL of the Apify Console, honoring the same environment the API client uses.
 *
 * When `APIFY_CLIENT_BASE_URL` points the CLI at a non-production environment (staging, a local
 * instance, ...), the Console links the CLI prints follow it instead of always pointing at
 * production. Resolution order:
 *
 * 1. `APIFY_CONSOLE_URL` — explicit Console override, used verbatim.
 * 2. `APIFY_CLIENT_BASE_URL` — the API base URL; its `api.` host is swapped for `console.`.
 * 3. The production Console URL.
 */
export function getConsoleUrl(): string {
	const explicit = process.env.APIFY_CONSOLE_URL;
	if (explicit) {
		return stripTrailingSlash(explicit);
	}

	const apiBaseUrl = process.env.APIFY_CLIENT_BASE_URL;
	if (apiBaseUrl) {
		try {
			const url = new URL(apiBaseUrl);
			url.hostname = url.hostname.replace(/^api\./, 'console.');
			// The Console lives at the host root; drop any API path such as `/v2`.
			return url.origin;
		} catch {
			// Malformed override — fall back to the production Console.
		}
	}

	return DEFAULT_CONSOLE_URL;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
