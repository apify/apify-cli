export const DEFAULT_MCP_URL = 'https://mcp.apify.com';

const MASK_VISIBLE_PREFIX_CHARS = 10;
const MASK_VISIBLE_SUFFIX_CHARS = 4;

export function buildMcpUrl(baseUrl: string, tools?: string): string {
	if (!tools) return baseUrl;

	const normalized = tools
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.join(',');

	if (!normalized) return baseUrl;

	// Use URL constructor so the tools value is properly encoded (handles &, =, #, spaces, etc.)
	// and existing query params / fragments on baseUrl are preserved.
	const url = new URL(baseUrl);
	url.searchParams.set('tools', normalized);
	return url.toString();
}

/** Token shorter than visible prefix + suffix is masked entirely to avoid leaking it whole. */
export function maskToken(token: string): string {
	if (token.length <= MASK_VISIBLE_PREFIX_CHARS + MASK_VISIBLE_SUFFIX_CHARS) return '***';
	return `${token.slice(0, MASK_VISIBLE_PREFIX_CHARS)}...${token.slice(-MASK_VISIBLE_SUFFIX_CHARS)}`;
}
