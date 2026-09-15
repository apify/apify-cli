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

/** The fields of a stored login that decide which Apify account a Console URL opens. */
export interface ConsoleAccount {
	id?: string;
	organizationOwnerUserId?: string;
}

/**
 * The Console route an organization login has to run under. Console takes the account from the path, and
 * where the path does not say it falls back to the account the browser was last on — so a bare URL can act
 * on an account the CLI never asked for.
 */
export function getConsoleRoutePrefix(account?: ConsoleAccount): string | null {
	return account?.organizationOwnerUserId && account.id ? `/organization/${account.id}` : null;
}

/**
 * Where a user manages the accounts Apify is connected to, including the git providers. Pass the account
 * whenever the page is opened to act on it, rather than only to be read.
 */
export function getConsoleIntegrationsUrl(account?: ConsoleAccount): string {
	return `${getConsoleUrl()}${getConsoleRoutePrefix(account) ?? ''}/settings/integrations`;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
