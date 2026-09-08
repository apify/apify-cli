import process from 'node:process';

const DEFAULT_OAUTH_ISSUER_URL = 'https://console-backend.apify.com';

// Client ID metadata document (draft-ietf-oauth-client-id-metadata-document): the client_id is the URL
// of a JSON document describing this CLI as a public OAuth client.
const DEFAULT_OAUTH_CLIENT_ID = 'https://apify.com/.well-known/oauth-clients/apify-cli.json';

export const OAUTH_SCOPE = 'full_api_access';

export const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

/** Refresh when the access token has less than this left. */
export const TOKEN_REFRESH_SKEW_MS = 60_000;

/** Also refresh when the refresh token itself has less than this left, so the session keeps rolling. */
export const REFRESH_TOKEN_RENEW_BEFORE_MS = 30 * 60_000;

/** How long the authorization-code flow waits for the browser redirect. */
export const AUTHORIZATION_CODE_TIMEOUT_MS = 5 * 60_000;

/** Upper bound for a single HTTP request to the authorization server, so a hung connection cannot stall a command. */
export const OAUTH_REQUEST_TIMEOUT_MS = 30_000;

/** Poll cadence when the device authorization response omits `interval` (RFC 8628 §3.2). */
export const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 5;

function readUrlEnv(name: string, fallback: string): string {
	const explicit = process.env[name];
	if (!explicit) return fallback;

	const stripped = explicit.replace(/\/+$/, '');
	if (!URL.canParse(stripped)) {
		throw new Error(`Invalid ${name} environment variable: "${explicit}" is not a valid URL.`);
	}
	return stripped;
}

/** Authorization server issuer. Its RFC 8414 metadata lives at `<issuer>/.well-known/oauth-authorization-server`. */
export function getOAuthIssuerUrl(): string {
	return readUrlEnv('APIFY_CLI_OAUTH_ISSUER_URL', DEFAULT_OAUTH_ISSUER_URL);
}

export function getOAuthClientId(): string {
	// The client_id URL may carry a query string (e.g. a signed key-value store record), so no slash stripping.
	const explicit = process.env.APIFY_CLI_OAUTH_CLIENT_ID;
	if (!explicit) return DEFAULT_OAUTH_CLIENT_ID;
	if (!URL.canParse(explicit)) {
		throw new Error(`Invalid APIFY_CLI_OAUTH_CLIENT_ID environment variable: "${explicit}" is not a valid URL.`);
	}
	return explicit;
}
