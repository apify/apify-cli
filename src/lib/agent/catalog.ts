import rawCatalog from './catalog.json' with { type: 'json' };

export type Tier = 'plugin' | 'skills+mcp' | 'mcp' | 'manual';
export const TIER_ORDER = ['plugin', 'skills+mcp', 'mcp', 'manual'] as const satisfies readonly Tier[];

export interface PluginEntry {
	id: string;
	marketplace: string; // forward-compat: P1 catalog refresh may introduce new marketplace values
}

export interface ClientEntry {
	maxTier: Tier;
	plugin: PluginEntry | null;
}

export interface Catalog {
	version: number;
	mcpUrl: string;
	skillsRepo: string;
	clients: Record<string, ClientEntry>;
}

function isPluginEntry(value: unknown): value is PluginEntry {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === 'string' && typeof v.marketplace === 'string';
}

export function isKnownTier(value: unknown): value is Tier {
	// Widen the array type so unknown is accepted without casting value — safer than `value as Tier`.
	return (TIER_ORDER as readonly unknown[]).includes(value);
}

function validateCatalog(raw: unknown): Catalog {
	if (typeof raw !== 'object' || raw === null) throw new Error('catalog.json: root must be an object');
	const r = raw as Record<string, unknown>;
	if (typeof r.version !== 'number') throw new Error('catalog.json: missing or invalid "version" field');
	if (typeof r.mcpUrl !== 'string') throw new Error('catalog.json: missing or invalid "mcpUrl" field');
	if (typeof r.skillsRepo !== 'string') throw new Error('catalog.json: missing or invalid "skillsRepo" field');
	if (typeof r.clients !== 'object' || r.clients === null)
		throw new Error('catalog.json: missing or invalid "clients" field');
	const clients = r.clients as Record<string, unknown>;
	for (const key of Object.keys(clients)) {
		const entry = clients[key];
		if (typeof entry !== 'object' || entry === null) throw new Error(`catalog.json: client "${key}" must be an object`);
		const e = entry as Record<string, unknown>;
		if (!isKnownTier(e.maxTier)) throw new Error(`catalog.json: client "${key}" has invalid "maxTier"`);
		if (e.plugin !== null && !isPluginEntry(e.plugin))
			throw new Error(`catalog.json: client "${key}" has invalid "plugin"`);
	}
	return {
		version: r.version as number,
		mcpUrl: r.mcpUrl as string,
		skillsRepo: r.skillsRepo as string,
		clients: clients as Record<string, ClientEntry>,
	};
}

// Validate at module load time so a malformed bundled JSON fails fast.
const catalog: Catalog = validateCatalog(rawCatalog);

export function getCatalog(): Catalog {
	return catalog;
}

export function getClientEntry(id: string): ClientEntry | undefined {
	return catalog.clients[id];
}

export function compareTiers(a: Tier, b: Tier): number {
	return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
}

// TODO(#1445 P1): catalog.mcpUrl duplicates DEFAULT_MCP_URL in src/lib/mcp/url.ts and APIFY_MCP_URL in apify/apify-mcp-server. Converge after maintainer sign-off.
export function buildSetupMcpUrl(base?: string): string {
	const url = new URL(base ?? catalog.mcpUrl);
	url.searchParams.set('client', 'apify-cli');
	return url.toString();
}
