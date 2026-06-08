import { buildMcpUrl, maskSecret, maskToken } from '../../../src/lib/mcp/url.js';

const TOKEN = 'apify_api_TEST_xxxxxxxxxxxxxxxxxxxxxx';

describe('mcp/url', () => {
	describe('maskToken()', () => {
		it('keeps a prefix and suffix for a long token', () => {
			expect(maskToken(TOKEN)).toBe('apify_api_...xxxx');
		});

		it('masks a short token entirely', () => {
			expect(maskToken('short')).toBe('***');
		});
	});

	describe('maskSecret()', () => {
		it('replaces every occurrence of the raw token with its masked form', () => {
			const leaky = `Command failed with ENOENT: claude --header 'Authorization: Bearer ${TOKEN}'`;
			const scrubbed = maskSecret(leaky, TOKEN);
			expect(scrubbed).not.toContain(TOKEN);
			expect(scrubbed).toContain(maskToken(TOKEN));
		});

		it('returns the text unchanged when the token is empty', () => {
			expect(maskSecret('nothing to mask', '')).toBe('nothing to mask');
		});
	});

	describe('buildMcpUrl()', () => {
		it('returns the base URL unchanged when no tools are given', () => {
			expect(buildMcpUrl('https://mcp.apify.com')).toBe('https://mcp.apify.com');
		});

		it('URL-encodes the tools value and preserves an existing query', () => {
			expect(buildMcpUrl('https://mcp.apify.com/v1?foo=bar', 'search-actors,foo&bar=baz quux')).toBe(
				'https://mcp.apify.com/v1?foo=bar&tools=search-actors%2Cfoo%26bar%3Dbaz+quux',
			);
		});
	});
});
