import process from 'node:process';

const DEFAULT_CONSOLE_URL = 'https://console.apify.com';

// When the Console is a local instance (local platform development), the CLI talks to the local API
// on this port rather than production — unless an explicit API URL is provided.
const DEFAULT_LOCAL_API_URL = 'http://localhost:3333';

/**
 * Resolves the base URL of the Apify Console used whenever the CLI prints links. Set
 * `APIFY_CONSOLE_URL` to point at a non-production Console (staging, a local instance, ...);
 * otherwise the production Console is used.
 */
export function getConsoleUrl(): string {
	const explicit = process.env.APIFY_CONSOLE_URL;
	if (explicit) {
		return stripTrailingSlash(explicit);
	}

	return DEFAULT_CONSOLE_URL;
}

/**
 * Resolves the base URL of the Apify API the CLI should talk to. An explicit `APIFY_CLIENT_BASE_URL`
 * always wins; otherwise, when the Console is a localhost instance (local platform development), the
 * CLI defaults to the local API so it follows the same environment the Console points at. Returning
 * `undefined` lets the client fall back to its own default (the production API).
 */
export function getApiBaseUrl(): string | undefined {
	if (process.env.APIFY_CLIENT_BASE_URL) {
		return process.env.APIFY_CLIENT_BASE_URL;
	}

	if (isLocalhostUrl(getConsoleUrl())) {
		return DEFAULT_LOCAL_API_URL;
	}

	return undefined;
}

function isLocalhostUrl(url: string): boolean {
	try {
		const { hostname } = new URL(url);
		return hostname === 'localhost' || hostname === '127.0.0.1';
	} catch {
		return false;
	}
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
