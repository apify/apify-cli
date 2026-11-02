import { fetchAuthorizationServerMetadata, OAuthDiscoveryError } from '../../../../src/lib/oauth/discovery.js';

const ISSUER = 'https://issuer.test';

const validDocument = {
	issuer: ISSUER,
	authorization_endpoint: 'https://console.test/authorize/oauth',
	device_authorization_endpoint: `${ISSUER}/oauth/apps/devices`,
	token_endpoint: `${ISSUER}/oauth/apps/token`,
	scopes_supported: ['full_api_access'],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchAuthorizationServerMetadata', () => {
	it('fetches the RFC 8414 document under the issuer', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(validDocument));

		const metadata = await fetchAuthorizationServerMetadata(ISSUER);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe(`${ISSUER}/.well-known/oauth-authorization-server`);
		expect(metadata).toEqual(validDocument);
	});

	it('rejects a non-2xx response', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'nope' }, 404));

		await expect(fetchAuthorizationServerMetadata(ISSUER)).rejects.toBeInstanceOf(OAuthDiscoveryError);
	});

	it('rejects a network failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

		await expect(fetchAuthorizationServerMetadata(ISSUER)).rejects.toThrow(/Could not reach/);
	});

	it('rejects a document whose issuer does not match', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...validDocument, issuer: 'https://other.test' }));

		await expect(fetchAuthorizationServerMetadata(ISSUER)).rejects.toThrow(/reports issuer/);
	});

	it('rejects a document without a token endpoint', async () => {
		const { token_endpoint: _omitted, ...withoutTokenEndpoint } = validDocument;
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(withoutTokenEndpoint));

		await expect(fetchAuthorizationServerMetadata(ISSUER)).rejects.toThrow(/token_endpoint/);
	});

	it('rejects a body that is not JSON', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }));

		await expect(fetchAuthorizationServerMetadata(ISSUER)).rejects.toThrow(/valid JSON/);
	});
});
