/**
 * Template taxonomy constants, ported from apify-core `src/packages/consts/src/templates.ts`.
 *
 * These are internal to apify-core and are NOT exported by the `@apify/actor-templates`
 * package, so they are copied here. They must stay in sync with the manifest served from
 * https://github.com/apify/actor-templates (the `category` and `useCases` fields).
 */

/**
 * Canonical use-case tags for Actor templates (as they appear in the manifest's `useCases[]`,
 * SCREAMING_SNAKE). Templates should be tagged for what they ARE (their primary purpose), not
 * for what they COULD become — that keeps the wizard filters meaningful.
 */
export const TEMPLATE_USE_CASES = {
	/** Entry-level scaffold for a user's first Actor — language quickstarts, empty projects, standby starters, generic wrappers (e.g. cli-start). Not a wizard option; surfaces via the fallback tiers. */
	STARTER: 'STARTER',
	/** Extracting structured data from websites — HTTP scrapers, browser scrapers, crawlers. The template's primary output is scraped data. */
	WEB_SCRAPING: 'WEB_SCRAPING',
	/** Bridges Apify with external systems — Standby mode (serves HTTP), MCP servers (callable by AI clients), or templates that call out to external APIs, services, or CLIs. */
	INTEGRATION: 'INTEGRATION',
	/** Performs actions rather than extracting data — test runners, browser automation (Playwright/Selenium/Cypress used for interaction), CLI orchestration. */
	AUTOMATION: 'AUTOMATION',
	/** LLM-powered agents, AI tool servers (MCP), and AI framework integration demos (LangChain, CrewAI, etc.). */
	AI: 'AI',
} as const;

/** Language ids, equal to the manifest's `category` field (lowercase). */
export const TEMPLATE_LANGUAGES = {
	JAVASCRIPT: 'javascript',
	TYPESCRIPT: 'typescript',
	PYTHON: 'python',
} as const;

/** Marker value representing "no specific language". */
export const ANY_TEMPLATE_LANGUAGE = 'any-language';

export const QUICK_START_TEMPLATE_IDS: Record<string, string | undefined> = {
	[TEMPLATE_LANGUAGES.TYPESCRIPT]: 'ts-crawlee-cheerio',
	[TEMPLATE_LANGUAGES.JAVASCRIPT]: 'js-crawlee-cheerio',
	[TEMPLATE_LANGUAGES.PYTHON]: 'python-crawlee-beautifulsoup',
};

export const EMPTY_TEMPLATE_IDS: Record<string, string | undefined> = {
	[TEMPLATE_LANGUAGES.TYPESCRIPT]: 'ts-empty',
	[TEMPLATE_LANGUAGES.JAVASCRIPT]: 'js-empty',
	[TEMPLATE_LANGUAGES.PYTHON]: 'python-empty',
};

/**
 * The four use cases exposed by the wizard, in prompt order. Each maps a `cliFlag` (what the user
 * types after `--use-case`) to a `templateTag` (the manifest `useCases[]` value it matches).
 * `STARTER` is intentionally absent — it only tags quick-start/empty templates so they surface via
 * the fallback tiers.
 */
export const USE_CASE_OPTIONS = [
	{ cliFlag: 'web-scraper', templateTag: TEMPLATE_USE_CASES.WEB_SCRAPING, label: 'Web scraping' },
	{ cliFlag: 'ai-agent', templateTag: TEMPLATE_USE_CASES.AI, label: 'AI agent' },
	{ cliFlag: 'data-pipeline', templateTag: TEMPLATE_USE_CASES.INTEGRATION, label: 'API & data pipeline' },
	{ cliFlag: 'browser-automation', templateTag: TEMPLATE_USE_CASES.AUTOMATION, label: 'Browser automation' },
] as const;

export type UseCaseOption = (typeof USE_CASE_OPTIONS)[number];

/**
 * The three concrete languages, in prompt order. `templateTag` is the manifest `category`, which is
 * also the value accepted by the `--language` flag.
 */
export const LANGUAGE_OPTIONS = [
	{ templateTag: TEMPLATE_LANGUAGES.JAVASCRIPT, label: 'JavaScript' },
	{ templateTag: TEMPLATE_LANGUAGES.TYPESCRIPT, label: 'TypeScript' },
	{ templateTag: TEMPLATE_LANGUAGES.PYTHON, label: 'Python' },
] as const;

export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];

/**
 * BYO-Docker escape hatch. Kept as a valid `--language` value even though no manifest
 * template matches it today; the recommendation falls through to showing all templates.
 */
export const OTHER_LANGUAGE = 'other';

/** Every accepted `--language` flag value. */
export const LANGUAGE_FLAG_CHOICES: string[] = [
	...LANGUAGE_OPTIONS.map((option) => option.templateTag),
	OTHER_LANGUAGE,
];

/** Every accepted `--use-case` flag value. */
export const USE_CASE_FLAG_CHOICES: string[] = USE_CASE_OPTIONS.map((option) => option.cliFlag);

/** Maps a `--use-case` flag value to its manifest tag, or `undefined` when unknown. */
export function useCaseFlagToId(flag: string): string | undefined {
	return USE_CASE_OPTIONS.find((option) => option.cliFlag === flag)?.templateTag;
}

/** Human-readable label for a use-case tag (used in the "no exact match" hint). */
export function useCaseLabel(id: string): string {
	return USE_CASE_OPTIONS.find((option) => option.templateTag === id)?.label ?? id;
}

/** Human-readable label for a language tag (used in the "no exact match" hint). */
export function languageLabel(id: string): string {
	if (id === ANY_TEMPLATE_LANGUAGE) return 'any language';
	if (id === OTHER_LANGUAGE) return 'other';
	return LANGUAGE_OPTIONS.find((option) => option.templateTag === id)?.label ?? id;
}
