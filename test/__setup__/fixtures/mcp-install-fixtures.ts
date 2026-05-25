import { fileURLToPath } from 'node:url';

/**
 * Pre-seeded Cursor `mcp.json` with a top-of-file line comment, an inline
 * comment, a trailing comma, and an unrelated server entry — used to verify
 * that `apify mcp install` round-trips JSONC without clobbering anything the
 * user typed by hand.
 */
export const cursorMcpJsoncWithCommentsPath = fileURLToPath(new URL('./mcp-install-fixtures.jsonc', import.meta.url));
