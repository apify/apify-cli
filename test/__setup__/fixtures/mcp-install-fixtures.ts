/**
 * Pre-seeded Cursor `mcp.json` with a top-of-file line comment, an inline
 * comment, a trailing comma, and an unrelated server entry — used to verify
 * that `apify mcp install` round-trips JSONC without clobbering anything the
 * user typed by hand.
 */
export const CURSOR_MCP_JSONC_WITH_COMMENTS = [
	'// User-added top-of-file comment',
	'{',
	'\t"mcpServers": {',
	'\t\t"github": {',
	'\t\t\t// PAT expires 2026-01',
	'\t\t\t"url": "https://api.githubcopilot.com/mcp",',
	'\t\t\t"headers": { "Authorization": "Bearer github_pat_XYZ" }',
	'\t\t},',
	'\t},',
	'}',
	'',
].join('\n');
