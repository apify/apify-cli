import { setTimeout as sleep } from 'node:timers/promises';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import {
	DEFAULT_DEVICE_POLL_INTERVAL_SECONDS,
	DEVICE_CODE_GRANT_TYPE,
	OAUTH_REQUEST_TIMEOUT_MS,
	OAUTH_SCOPE,
} from './consts.js';
import type { AuthorizationServerMetadata } from './discovery.js';
import { postTokenRequest, type TokenResponse } from './token-endpoint.js';

/** RFC 8628 §3.2 device authorization response. */
interface DeviceAuthorizationResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
}

export interface DeviceCodePrompt {
	verificationUri: string;
	verificationUriComplete?: string;
	userCode: string;
	expiresInSeconds: number;
}

export type DeviceCodeLoginResult =
	| { tokens: TokenResponse }
	/** The server cannot run this flow; the caller should try another one. Nothing was shown to the user. */
	| { unsupported: true; reason: string }
	| { stopReason: 'accessDenied' | 'expired' | 'aborted'; message: string };

export interface DeviceCodeLoginOptions {
	metadata: AuthorizationServerMetadata;
	clientId: string;
	signal?: AbortSignal;
	/** Called once the user has something to act on: the verification URL and code. */
	onPrompt: (prompt: DeviceCodePrompt) => void | Promise<void>;
}

const requestDeviceAuthorization = async (
	endpoint: string,
	clientId: string,
): Promise<{ ok: true; body: DeviceAuthorizationResponse } | { ok: false; reason: string }> => {
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
				...APIFY_CLIENT_DEFAULT_HEADERS,
			},
			body: new URLSearchParams({ client_id: clientId, scope: OAUTH_SCOPE }),
			signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		return { ok: false, reason: `could not reach ${endpoint}: ${(err as Error).message}` };
	}

	let body: Partial<DeviceAuthorizationResponse> & { error?: string; error_description?: string } = {};
	try {
		body = (await response.json()) as typeof body;
	} catch {
		// Reported through the status code below.
	}

	if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri || !body.expires_in) {
		const detail = body.error_description ?? body.error ?? `status ${response.status}`;
		return { ok: false, reason: `device authorization failed (${detail})` };
	}

	return { ok: true, body: body as DeviceAuthorizationResponse };
};

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628). Polls the token endpoint at the cadence the server
 * asked for — `interval` from the device authorization response, plus 5 s whenever it answers `slow_down`.
 */
export async function loginWithDeviceCode({
	metadata,
	clientId,
	signal,
	onPrompt,
}: DeviceCodeLoginOptions): Promise<DeviceCodeLoginResult> {
	if (!metadata.device_authorization_endpoint) {
		return { unsupported: true, reason: 'the authorization server does not advertise a device authorization endpoint' };
	}

	const authorization = await requestDeviceAuthorization(metadata.device_authorization_endpoint, clientId);
	if (!authorization.ok) {
		return { unsupported: true, reason: authorization.reason };
	}

	const { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval } =
		authorization.body;

	await onPrompt({
		verificationUri: verification_uri,
		verificationUriComplete: verification_uri_complete,
		userCode: user_code,
		expiresInSeconds: expires_in,
	});

	let intervalSeconds = interval ?? DEFAULT_DEVICE_POLL_INTERVAL_SECONDS;
	const deadline = Date.now() + expires_in * 1000;

	while (Date.now() < deadline) {
		try {
			await sleep(intervalSeconds * 1000, undefined, { signal });
		} catch {
			return { stopReason: 'aborted', message: 'Login was aborted.' };
		}
		if (signal?.aborted) return { stopReason: 'aborted', message: 'Login was aborted.' };

		let result;
		try {
			result = await postTokenRequest(metadata.token_endpoint, {
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code,
				client_id: clientId,
			});
		} catch (err) {
			// Transient network trouble: keep polling until the code expires.
			cliDebugPrint('oauth', 'device code poll failed', err);
			continue;
		}

		if (result.ok) return { tokens: result.tokens };

		cliDebugPrint('oauth', 'device code poll', result.error.code, `next in ${intervalSeconds}s`);

		switch (result.error.code) {
			case 'authorization_pending':
				continue;
			case 'slow_down':
				intervalSeconds += 5;
				continue;
			case 'access_denied':
				return {
					stopReason: 'accessDenied',
					message: 'Login to Apify failed, the request was denied in Apify Console.',
				};
			case 'expired_token':
				return {
					stopReason: 'expired',
					message: 'Login to Apify failed, the device code expired before it was confirmed.',
				};
			default:
				return {
					stopReason: 'accessDenied',
					message: `Login to Apify failed, the authorization server answered: ${result.error.message}`,
				};
		}
	}

	return { stopReason: 'expired', message: 'Login to Apify failed, the device code expired before it was confirmed.' };
}
