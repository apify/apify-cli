import process from 'node:process';

const DEFAULT_CONSOLE_URL = 'https://console.apify.com';

/**
 * Resolves the base URL of the Apify Console used whenever the CLI prints links. Set
 * `APIFY_CONSOLE_URL` to point at a non-production Console (staging, a local instance, ...);
 * otherwise the production Console is used.
 */
export function getConsoleUrl(): string {
	const explicit = process.env.APIFY_CONSOLE_URL;
	if (explicit) {
		const stripped = stripTrailingSlash(explicit);
		if (!URL.canParse(stripped)) {
			throw new Error(`Invalid APIFY_CONSOLE_URL environment variable: "${explicit}" is not a valid URL.`);
		}
		return stripped;
	}

	return DEFAULT_CONSOLE_URL;
}

/** Where a user manages the accounts Apify is connected to, including the git providers. */
export function getConsoleIntegrationsUrl(): string {
	return `${getConsoleUrl()}/settings/integrations`;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
