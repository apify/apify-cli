import {
	buildSetupMcpUrl,
	compareTiers,
	getCatalog,
	getClientEntry,
	isKnownTier,
} from '../../../../src/lib/agent/catalog.js';
import { SUPPORTED_CLIENTS } from '../../../../src/lib/mcp/clients.js';

describe('agent/catalog', () => {
	describe('getCatalog()', () => {
		it('returns an object with version, mcpUrl, skillsRepo, clients', () => {
			const cat = getCatalog();
			expect(cat).toHaveProperty('version');
			expect(cat).toHaveProperty('mcpUrl');
			expect(cat).toHaveProperty('skillsRepo');
			expect(cat).toHaveProperty('clients');
		});

		it('mcpUrl is the Apify MCP base URL', () => {
			expect(getCatalog().mcpUrl).toBe('https://mcp.apify.com');
		});
	});

	describe('getClientEntry()', () => {
		it('"claude-code" returns { maxTier: "mcp", plugin: null }', () => {
			expect(getClientEntry('claude-code')).toEqual({
				maxTier: 'mcp',
				plugin: null,
			});
		});

		it('"vscode" returns an object with a maxTier property', () => {
			const entry = getClientEntry('vscode');
			expect(entry).toBeDefined();
			expect(entry).toHaveProperty('maxTier');
		});

		it('"unknown-xyz-client" returns undefined without throwing', () => {
			expect(() => getClientEntry('unknown-xyz-client')).not.toThrow();
			expect(getClientEntry('unknown-xyz-client')).toBeUndefined();
		});
	});

	describe('compareTiers()', () => {
		it('"plugin" vs "mcp" is negative (plugin is preferred)', () => {
			expect(compareTiers('plugin', 'mcp')).toBeLessThan(0);
		});

		it('"mcp" vs "mcp" is 0', () => {
			expect(compareTiers('mcp', 'mcp')).toBe(0);
		});

		it('"manual" vs "plugin" is positive', () => {
			expect(compareTiers('manual', 'plugin')).toBeGreaterThan(0);
		});
	});

	describe('buildSetupMcpUrl()', () => {
		it('returns a URL containing client=apify-cli', () => {
			expect(buildSetupMcpUrl()).toContain('client=apify-cli');
		});

		it('preserves existing query params from the base URL', () => {
			const result = buildSetupMcpUrl('https://mcp.apify.com?tools=foo');
			expect(result).toContain('client=apify-cli');
			expect(result).toContain('tools=foo');
		});

		it('does not duplicate client= when already present in the base URL', () => {
			const first = buildSetupMcpUrl();
			const second = buildSetupMcpUrl(first);
			expect(second).toBe(first);
		});
	});

	describe('isKnownTier()', () => {
		it('returns true for every value in TIER_ORDER', () => {
			expect(isKnownTier('plugin')).toBe(true);
			expect(isKnownTier('skills+mcp')).toBe(true);
			expect(isKnownTier('mcp')).toBe(true);
			expect(isKnownTier('manual')).toBe(true);
		});

		it('returns false for "__proto__"', () => {
			expect(isKnownTier('__proto__')).toBe(false);
		});

		it('returns false for "constructor"', () => {
			expect(isKnownTier('constructor')).toBe(false);
		});

		it('returns false for null', () => {
			expect(isKnownTier(null)).toBe(false);
		});

		it('returns false for undefined', () => {
			expect(isKnownTier(undefined)).toBe(false);
		});
	});

	describe('catalog integrity', () => {
		it('every client key in the catalog is present in SUPPORTED_CLIENTS (drift detection)', () => {
			const catalogKeys = Object.keys(getCatalog().clients);
			for (const key of catalogKeys) {
				expect(SUPPORTED_CLIENTS).toContain(key);
			}
		});
	});
});
