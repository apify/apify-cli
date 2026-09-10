import { loginWithAuthorizationCode, pkceChallengeFromVerifier } from '../../../../src/lib/oauth/authorization-code.js';
import type { AuthorizationServerMetadata } from '../../../../src/lib/oauth/discovery.js';

const ISSUER = 'https://issuer.test';
const CLIENT_ID = 'https://client.test/oauth-client.json';

const metadata: AuthorizationServerMetadata = {
	issuer: ISSUER,
	authorization_endpoint: 'https://console.test/authorize/oauth',
	token_endpoint: `${ISSUER}/oauth/apps/token`,
};

const tokens = {
	access_token: 'integration_api_token_new',
	token_type: 'Bearer',
	expires_in: 3599,
	refresh_token: 'rt-1',
};

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Mocks only the token endpoint; everything else (the loopback redirect) goes over the wire. */
const mockTokenEndpoint = (respond: () => Response) =>
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		if (String(input) === metadata.token_endpoint) return respond();
		return realFetch(input, init);
	});

/** Starts the flow and hands back the authorize URL the user would be sent to. */
const start = async (respondToExchange: () => Response = () => json(tokens)) => {
	const fetchSpy = mockTokenEndpoint(respondToExchange);
	let authorizeUrl!: URL;
	const finished = loginWithAuthorizationCode({
		metadata,
		clientId: CLIENT_ID,
		onPrompt: (url) => {
			authorizeUrl = new URL(url);
		},
	});
	await vi.waitFor(() => expect(authorizeUrl).toBeDefined());

	const redirect = (params: Record<string, string>) => {
		const url = new URL(authorizeUrl.searchParams.get('redirect_uri')!);
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
		return realFetch(url);
	};

	return { finished, authorizeUrl, redirect, fetchSpy };
};

describe('pkceChallengeFromVerifier', () => {
	// RFC 7636 Appendix B.
	it('derives the S256 challenge', () => {
		expect(pkceChallengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
			'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		);
	});
});

describe('loginWithAuthorizationCode', () => {
	it('is unsupported when the server has no authorization endpoint', async () => {
		const onPrompt = vi.fn();
		const result = await loginWithAuthorizationCode({
			metadata: { issuer: ISSUER, token_endpoint: metadata.token_endpoint },
			clientId: CLIENT_ID,
			onPrompt,
		});

		expect(result).toMatchObject({ unsupported: true });
		expect(onPrompt).not.toHaveBeenCalled();
	});

	it('builds a PKCE authorize URL with a loopback redirect and exchanges the code', async () => {
		const { finished, authorizeUrl, redirect, fetchSpy } = await start();

		expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(metadata.authorization_endpoint);
		expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
		expect(authorizeUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
		expect(authorizeUrl.searchParams.get('scope')).toBe('full_api_access');
		expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
		expect(authorizeUrl.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

		const state = authorizeUrl.searchParams.get('state')!;
		const response = await redirect({ code: 'auth-code', state });
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('You can close this tab');

		expect(await finished).toEqual({ tokens });

		const exchange = fetchSpy.mock.calls.find(([input]) => String(input) === metadata.token_endpoint)!;
		const body = Object.fromEntries(exchange[1]!.body as URLSearchParams);
		expect(body).toMatchObject({
			grant_type: 'authorization_code',
			code: 'auth-code',
			redirect_uri: authorizeUrl.searchParams.get('redirect_uri'),
			client_id: CLIENT_ID,
		});
		expect(pkceChallengeFromVerifier(body.code_verifier)).toBe(authorizeUrl.searchParams.get('code_challenge'));
	});

	it('ignores a redirect with the wrong state and keeps waiting', async () => {
		const { finished, authorizeUrl, redirect } = await start();

		const bogus = await redirect({ code: 'evil', state: 'not-ours' });
		expect(bogus.status).toBe(400);

		await redirect({ code: 'auth-code', state: authorizeUrl.searchParams.get('state')! });
		expect(await finished).toEqual({ tokens });
	});

	it('stops when the authorization server reports an error', async () => {
		const { finished, authorizeUrl, redirect } = await start();

		await redirect({
			error: 'access_denied',
			error_description: 'User denied',
			state: authorizeUrl.searchParams.get('state')!,
		});

		expect(await finished).toMatchObject({
			stopReason: 'accessDenied',
			message: expect.stringContaining('User denied'),
		});
	});

	it('reports a failed code exchange', async () => {
		const { finished, authorizeUrl, redirect } = await start(() => json({ error: 'invalid_grant' }, 400));

		await redirect({ code: 'auth-code', state: authorizeUrl.searchParams.get('state')! });

		expect(await finished).toMatchObject({ stopReason: 'exchangeFailed' });
	});

	it('times out when the browser never comes back', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const { finished } = await start();
			await vi.advanceTimersByTimeAsync(5 * 60_000);
			expect(await finished).toMatchObject({ stopReason: 'timedOut' });
		} finally {
			vi.useRealTimers();
		}
	});
});
