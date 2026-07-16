/**
 * Template taxonomy constants, ported from apify-core `src/packages/consts/src/templates.ts`.
 *
 * These are internal to apify-core and are NOT exported by the `@apify/actor-templates`
 * package, so they are copied here. They must stay in sync with the manifest served from
 * https://github.com/apify/actor-templates (the `category` and `useCases` fields).
 */

/** Use-case ids as they appear in the manifest's `useCases[]` (SCREAMING_SNAKE). */
export const TEMPLATE_USE_CASES = {
	/** Entry-level scaffold for a user's first Actor. Not exposed as a wizard option; used by the fallback tiers. */
	STARTER: 'STARTER',
	WEB_SCRAPING: 'WEB_SCRAPING',
	INTEGRATION: 'INTEGRATION',
	AUTOMATION: 'AUTOMATION',
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

export interface UseCaseOption {
	/** kebab-case value accepted by the `--use-case` flag. */
	flag: string;
	/** Manifest id this maps to (value in `useCases[]`). */
	id: string;
	/** Human-readable label shown in the interactive prompt. */
	label: string;
}

/**
 * The four use cases exposed by the wizard, in prompt order. `STARTER` is intentionally
 * omitted — it only tags quick-start/empty templates so they surface via the fallback tiers.
 */
export const USE_CASE_OPTIONS: UseCaseOption[] = [
	{ flag: 'web-scraping', id: TEMPLATE_USE_CASES.WEB_SCRAPING, label: 'Web scraping' },
	{ flag: 'ai-agent', id: TEMPLATE_USE_CASES.AI, label: 'AI agent' },
	{ flag: 'api-pipeline', id: TEMPLATE_USE_CASES.INTEGRATION, label: 'API & data pipeline' },
	{ flag: 'browser-automation', id: TEMPLATE_USE_CASES.AUTOMATION, label: 'Browser automation' },
];

export interface LanguageOption {
	/** Manifest `category`, which is also the value accepted by the `--language` flag. */
	id: string;
	/** Human-readable label shown in the interactive prompt. */
	label: string;
}

/** The three concrete languages, in prompt order. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ id: TEMPLATE_LANGUAGES.JAVASCRIPT, label: 'JavaScript' },
	{ id: TEMPLATE_LANGUAGES.TYPESCRIPT, label: 'TypeScript' },
	{ id: TEMPLATE_LANGUAGES.PYTHON, label: 'Python' },
];

/**
 * BYO-Docker escape hatch. Kept as a valid `--language` value even though no manifest
 * template matches it today; the recommendation falls through to showing all templates.
 */
export const OTHER_LANGUAGE = 'other';

/** Every accepted `--language` flag value. */
export const LANGUAGE_FLAG_CHOICES: string[] = [...LANGUAGE_OPTIONS.map((option) => option.id), OTHER_LANGUAGE];

/** Every accepted `--use-case` flag value. */
export const USE_CASE_FLAG_CHOICES: string[] = USE_CASE_OPTIONS.map((option) => option.flag);

/** Maps a `--use-case` flag value to its manifest id, or `undefined` when unknown. */
export function useCaseFlagToId(flag: string): string | undefined {
	return USE_CASE_OPTIONS.find((option) => option.flag === flag)?.id;
}

/** Human-readable label for a use-case id (used in the "no exact match" hint). */
export function useCaseLabel(id: string): string {
	return USE_CASE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

/** Human-readable label for a language id (used in the "no exact match" hint). */
export function languageLabel(id: string): string {
	if (id === ANY_TEMPLATE_LANGUAGE) return 'any language';
	if (id === OTHER_LANGUAGE) return 'other';
	return LANGUAGE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
