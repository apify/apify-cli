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

/** Marker value representing "no specific use case" (mirrors {@link ANY_TEMPLATE_LANGUAGE}). */
export const ANY_TEMPLATE_USE_CASE = 'any-use-case';

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
	{ cliFlag: 'web-scraper', templateTag: TEMPLATE_USE_CASES.WEB_SCRAPING, label: 'Web scraper' },
	{ cliFlag: 'ai-agent', templateTag: TEMPLATE_USE_CASES.AI, label: 'AI agent' },
	{ cliFlag: 'data-pipeline', templateTag: TEMPLATE_USE_CASES.INTEGRATION, label: 'API & data pipeline' },
	{ cliFlag: 'browser-automation', templateTag: TEMPLATE_USE_CASES.AUTOMATION, label: 'Browser automation' },
] as const;

export type UseCaseOption = (typeof USE_CASE_OPTIONS)[number];

/**
 * The three concrete languages, in prompt order. For languages the `cliFlag` and `templateTag`
 * (manifest `category`) are the same value — kept as separate fields to mirror {@link UseCaseOption}.
 * `aliases` are extra accepted spellings for the flag.
 */
export const LANGUAGE_OPTIONS = [
	{
		cliFlag: TEMPLATE_LANGUAGES.JAVASCRIPT,
		templateTag: TEMPLATE_LANGUAGES.JAVASCRIPT,
		label: 'JavaScript',
		aliases: ['js'],
	},
	{
		cliFlag: TEMPLATE_LANGUAGES.TYPESCRIPT,
		templateTag: TEMPLATE_LANGUAGES.TYPESCRIPT,
		label: 'TypeScript',
		aliases: ['ts'],
	},
	{ cliFlag: TEMPLATE_LANGUAGES.PYTHON, templateTag: TEMPLATE_LANGUAGES.PYTHON, label: 'Python', aliases: ['py'] },
] as const;

export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];

/** Every accepted `--language` flag value (canonical values plus their aliases). */
export const LANGUAGE_FLAG_CHOICES: string[] = LANGUAGE_OPTIONS.flatMap((option) => [
	option.cliFlag,
	...option.aliases,
]);

/** Every accepted `--use-case` flag value. */
export const USE_CASE_FLAG_CHOICES: string[] = USE_CASE_OPTIONS.map((option) => option.cliFlag);

/** Maps a `--use-case` flag value to its manifest tag, or `undefined` when unknown. */
export function useCaseFlagToTag(flag: string): string | undefined {
	return USE_CASE_OPTIONS.find((option) => option.cliFlag === flag)?.templateTag;
}

/** Maps a `--language` flag value (canonical or alias, e.g. `js`) to its manifest tag, or `undefined` when unknown. */
export function languageFlagToTag(flag: string): string | undefined {
	return LANGUAGE_OPTIONS.find(
		(option) => option.cliFlag === flag || (option.aliases as readonly string[]).includes(flag),
	)?.templateTag;
}

/** Human-readable label for a use-case tag (used in the "no exact match" hint). */
export function useCaseLabel(id: string): string {
	return USE_CASE_OPTIONS.find((option) => option.templateTag === id)?.label ?? id;
}

/** Human-readable label for a language tag. */
export function languageLabel(id: string): string {
	if (id === ANY_TEMPLATE_LANGUAGE) return 'any language';
	return LANGUAGE_OPTIONS.find((option) => option.templateTag === id)?.label ?? id;
}
