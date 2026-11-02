import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { OAUTH_REQUEST_TIMEOUT_MS } from './consts.js';

export interface TokenResponse {
	access_token: string;
	token_type: string;
	scope?: string;
	expires_in?: number;
	refresh_token?: string;
	refresh_token_expires_in?: number;
}

/** RFC 6749 §5.2 / RFC 8628 §3.5 error response. */
export class OAuthError extends Error {
	override name = 'OAuthError';

	constructor(
		public readonly code: string,
		public readonly status: number,
		public readonly description?: string,
	) {
		super(description ? `${code}: ${description}` : code);
	}
}

export type TokenRequestResult = { ok: true; tokens: TokenResponse } | { ok: false; error: OAuthError };

/**
 * POSTs a form-encoded request to the token endpoint. Network failures throw; OAuth error responses
 * are returned so the caller can branch on `error.code` (`authorization_pending`, `slow_down`, ...).
 */
export async function postTokenRequest(
	tokenEndpoint: string,
	params: Record<string, string>,
): Promise<TokenRequestResult> {
	const response = await fetch(tokenEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
			...APIFY_CLIENT_DEFAULT_HEADERS,
		},
		body: new URLSearchParams(params),
		signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
	});

	const text = await response.text();
	let body: Record<string, unknown> = {};
	try {
		body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
	} catch {
		// Non-JSON bodies are reported through the status code below.
	}

	if (response.ok && typeof body.access_token === 'string') {
		return { ok: true, tokens: body as unknown as TokenResponse };
	}

	const code = typeof body.error === 'string' ? body.error : `http_${response.status}`;
	const description = typeof body.error_description === 'string' ? body.error_description : undefined;
	return { ok: false, error: new OAuthError(code, response.status, description) };
}

export async function refreshAccessToken(params: {
	tokenEndpoint: string;
	clientId: string;
	refreshToken: string;
}): Promise<TokenResponse> {
	const result = await postTokenRequest(params.tokenEndpoint, {
		grant_type: 'refresh_token',
		refresh_token: params.refreshToken,
		client_id: params.clientId,
	});

	if (!result.ok) throw result.error;
	return result.tokens;
}
