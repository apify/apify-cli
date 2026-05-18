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

	const separator = baseUrl.includes('?') ? '&' : '?';
	return `${baseUrl}${separator}tools=${normalized}`;
}

/** Token shorter than visible prefix + suffix is masked entirely to avoid leaking it whole. */
export function maskToken(token: string): string {
	if (token.length <= MASK_VISIBLE_PREFIX_CHARS + MASK_VISIBLE_SUFFIX_CHARS) return '***';
	return `${token.slice(0, MASK_VISIBLE_PREFIX_CHARS)}...${token.slice(-MASK_VISIBLE_SUFFIX_CHARS)}`;
}
