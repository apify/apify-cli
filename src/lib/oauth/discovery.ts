import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { OAUTH_REQUEST_TIMEOUT_MS } from './consts.js';

/** Subset of RFC 8414 authorization server metadata the CLI uses. */
export interface AuthorizationServerMetadata {
	issuer: string;
	authorization_endpoint?: string;
	device_authorization_endpoint?: string;
	token_endpoint: string;
	scopes_supported?: string[];
	grant_types_supported?: string[];
	code_challenge_methods_supported?: string[];
}

export class OAuthDiscoveryError extends Error {
	override name = 'OAuthDiscoveryError';
}

export async function fetchAuthorizationServerMetadata(issuer: string): Promise<AuthorizationServerMetadata> {
	const url = `${issuer}/.well-known/oauth-authorization-server`;

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Accept: 'application/json', ...APIFY_CLIENT_DEFAULT_HEADERS },
			signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		throw new OAuthDiscoveryError(`Could not reach ${url}: ${(err as Error).message}`);
	}

	if (!response.ok) {
		throw new OAuthDiscoveryError(`Fetching ${url} failed with status ${response.status}.`);
	}

	let metadata: Partial<AuthorizationServerMetadata>;
	try {
		metadata = (await response.json()) as Partial<AuthorizationServerMetadata>;
	} catch {
		throw new OAuthDiscoveryError(`${url} did not return valid JSON.`);
	}

	if (typeof metadata.token_endpoint !== 'string') {
		throw new OAuthDiscoveryError(`${url} is missing "token_endpoint".`);
	}

	// RFC 8414 §3.3: the issuer in the document must match the one it was fetched for.
	if (metadata.issuer !== issuer) {
		throw new OAuthDiscoveryError(`${url} reports issuer "${metadata.issuer}", expected "${issuer}".`);
	}

	return metadata as AuthorizationServerMetadata;
}
