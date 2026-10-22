import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { AUTHORIZATION_CODE_TIMEOUT_MS, OAUTH_SCOPE } from './consts.js';
import type { AuthorizationServerMetadata } from './discovery.js';
import { postTokenRequest, type TokenResponse } from './token-endpoint.js';

export type AuthorizationCodeLoginResult =
	| { tokens: TokenResponse }
	/** The server cannot run this flow; the caller should try another one. Nothing was shown to the user. */
	| { unsupported: true; reason: string }
	| { stopReason: 'accessDenied' | 'timedOut' | 'aborted' | 'exchangeFailed'; message: string };

export interface AuthorizationCodeLoginOptions {
	metadata: AuthorizationServerMetadata;
	clientId: string;
	signal?: AbortSignal;
	/** Called with the authorize URL the user has to open. */
	onPrompt: (authorizeUrl: string) => void | Promise<void>;
}

/** RFC 7636 §4.2: `BASE64URL(SHA256(code_verifier))`. */
export function pkceChallengeFromVerifier(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

const CALLBACK_PATH = '/callback';

const CALLBACK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Apify CLI</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem">
<h1>You are logged in to the Apify CLI</h1><p>You can close this tab and return to your terminal.</p>
</body></html>`;

type CallbackOutcome = { code: string } | { stopReason: 'accessDenied' | 'timedOut' | 'aborted'; message: string };

/**
 * OAuth 2.0 Authorization Code Grant with PKCE for a native app (RFC 8252): the redirect lands on a
 * loopback HTTP server that the CLI starts on a random port.
 */
export async function loginWithAuthorizationCode({
	metadata,
	clientId,
	signal,
	onPrompt,
}: AuthorizationCodeLoginOptions): Promise<AuthorizationCodeLoginResult> {
	if (!metadata.authorization_endpoint) {
		return { unsupported: true, reason: 'the authorization server does not advertise an authorization endpoint' };
	}

	const codeVerifier = randomBytes(32).toString('base64url');
	const codeChallenge = pkceChallengeFromVerifier(codeVerifier);
	const state = randomBytes(16).toString('base64url');

	let resolve!: (outcome: CallbackOutcome) => void;
	const finished = new Promise<CallbackOutcome>((resolveFinished) => {
		resolve = resolveFinished;
	});

	const server = createServer((req, res) => {
		res.setHeader('Connection', 'close');
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');

		if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
			res.statusCode = 404;
			res.end('Not found');
			return;
		}

		// A mismatched state is not ours to act on: answer and keep waiting for the real redirect.
		if (url.searchParams.get('state') !== state) {
			res.statusCode = 400;
			res.end('Invalid state');
			return;
		}

		const oauthError = url.searchParams.get('error');
		const code = url.searchParams.get('code');

		if (oauthError || !code) {
			res.statusCode = 400;
			res.end('Login failed. You can close this tab.');
			const description =
				url.searchParams.get('error_description') ?? oauthError ?? 'no authorization code was returned';
			resolve({ stopReason: 'accessDenied', message: `Login to Apify failed: ${description}.` });
			return;
		}

		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.end(CALLBACK_PAGE);
		resolve({ code });
	});

	const timer = setTimeout(
		() =>
			resolve({
				stopReason: 'timedOut',
				message: `Login to Apify did not finish within ${AUTHORIZATION_CODE_TIMEOUT_MS / 60_000} minutes.`,
			}),
		AUTHORIZATION_CODE_TIMEOUT_MS,
	);

	signal?.addEventListener('abort', () => resolve({ stopReason: 'aborted', message: 'Login was aborted.' }), {
		once: true,
	});

	try {
		await new Promise<void>((resolveListen, rejectListen) => {
			server.once('error', rejectListen);
			server.listen(0, '127.0.0.1', () => resolveListen());
		});
	} catch (err) {
		clearTimeout(timer);
		return { unsupported: true, reason: `could not start a loopback server: ${(err as Error).message}` };
	}

	const { port } = server.address() as AddressInfo;
	const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

	const authorizeUrl = new URL(metadata.authorization_endpoint);
	authorizeUrl.searchParams.set('response_type', 'code');
	authorizeUrl.searchParams.set('client_id', clientId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('scope', OAUTH_SCOPE);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('code_challenge', codeChallenge);
	authorizeUrl.searchParams.set('code_challenge_method', 'S256');

	let outcome: CallbackOutcome;
	try {
		await onPrompt(authorizeUrl.href);
		outcome = await finished;
	} finally {
		clearTimeout(timer);
		// `close` alone waits for the browser's keep-alive socket, which would hang the command.
		server.closeAllConnections();
		server.close();
	}

	if ('stopReason' in outcome) return outcome;

	const exchange = await postTokenRequest(metadata.token_endpoint, {
		grant_type: 'authorization_code',
		code: outcome.code,
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: codeVerifier,
	});

	if (!exchange.ok) {
		return {
			stopReason: 'exchangeFailed',
			message: `Login to Apify failed, the authorization code could not be exchanged: ${exchange.error.message}`,
		};
	}

	return { tokens: exchange.tokens };
}
