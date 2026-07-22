import type { Template } from '@apify/actor-templates';

import { ANY_TEMPLATE_LANGUAGE, TEMPLATE_USE_CASES } from '../../../src/lib/templates/consts.js';
import { getTemplateRecommendation } from '../../../src/lib/templates/getTemplateRecommendation.js';

function makeTemplate(id: string, category: string, useCases?: string[]): Template {
	return {
		id,
		name: id,
		label: `Label ${id}`,
		category,
		technologies: [],
		description: `Description ${id}`,
		archiveUrl: `https://example.com/${id}.zip`,
		...(useCases ? { useCases } : {}),
	};
}

const { WEB_SCRAPING, AI, INTEGRATION, AUTOMATION, STARTER } = TEMPLATE_USE_CASES;

// A synthetic manifest that exercises every tier. Order matters — it is the tie-break within a tier.
const templates: Template[] = [
	makeTemplate('js-crawlee-cheerio', 'javascript', [WEB_SCRAPING, STARTER]), // JS quick-start
	makeTemplate('js-scraper', 'javascript', [WEB_SCRAPING]),
	makeTemplate('js-integration', 'javascript', [INTEGRATION]),
	makeTemplate('js-empty', 'javascript', [STARTER]), // JS empty
	makeTemplate('ts-crawlee-cheerio', 'typescript', [WEB_SCRAPING, STARTER]), // TS quick-start
	makeTemplate('ts-empty', 'typescript', [STARTER]), // TS empty
	makeTemplate('ts-automation', 'typescript', [AUTOMATION]),
	makeTemplate('python-crawlee-beautifulsoup', 'python', [WEB_SCRAPING, STARTER]), // Python quick-start
	makeTemplate('python-ai', 'python', [AI]),
	makeTemplate('python-empty', 'python', [STARTER]), // Python empty
	makeTemplate('no-usecases', 'python'), // template lacking useCases
];

const ids = (recommendation: ReturnType<typeof getTemplateRecommendation>) => recommendation.map((r) => r.template.id);
const exactIds = (recommendation: ReturnType<typeof getTemplateRecommendation>) =>
	recommendation.filter((r) => r.isExactMatch).map((r) => r.template.id);

describe('getTemplateRecommendation', () => {
	it('always returns every template exactly once, in priority order', () => {
		const result = getTemplateRecommendation(templates, WEB_SCRAPING, 'python');

		expect(result).toHaveLength(templates.length);
		expect(new Set(ids(result)).size).toBe(templates.length);
	});

	describe('specific language + use case', () => {
		it('puts exact (language + use-case) matches first, in manifest order', () => {
			const result = getTemplateRecommendation(templates, WEB_SCRAPING, 'python');

			// Only the two Python WEB_SCRAPING templates are exact matches.
			expect(exactIds(result)).toEqual(['python-crawlee-beautifulsoup']);
			expect(result[0]).toMatchObject({ template: { id: 'python-crawlee-beautifulsoup' }, isExactMatch: true });
		});

		it('follows exact matches with the language quick-start, empty, then rest of the language', () => {
			// Python + AI: exact is python-ai, then quick-start, empty, then remaining python templates.
			const result = getTemplateRecommendation(templates, AI, 'python');

			expect(exactIds(result)).toEqual(['python-ai']);
			expect(ids(result).slice(0, 4)).toEqual([
				'python-ai', // exact
				'python-crawlee-beautifulsoup', // quick-start
				'python-empty', // empty
				'no-usecases', // remaining python (tier 4), then non-python fall-throughs
			]);
		});

		it('does not duplicate a template that qualifies for several tiers', () => {
			// python-crawlee-beautifulsoup is both an exact match and the quick-start.
			const result = getTemplateRecommendation(templates, WEB_SCRAPING, 'python');
			const occurrences = ids(result).filter((id) => id === 'python-crawlee-beautifulsoup');

			expect(occurrences).toHaveLength(1);
		});

		it('marks every non-exact fallback template isExactMatch: false', () => {
			const result = getTemplateRecommendation(templates, AI, 'python');
			const nonExact = result.filter((r) => !r.isExactMatch);

			expect(nonExact.every((r) => r.template.id !== 'python-ai')).toBe(true);
		});
	});

	describe('no exact matches', () => {
		it('flags nothing as exact but still returns the full list', () => {
			// AUTOMATION + javascript has no exact match in the fixture (only ts-automation exists).
			const result = getTemplateRecommendation(templates, AUTOMATION, 'javascript');

			expect(exactIds(result)).toEqual([]);
			expect(result).toHaveLength(templates.length);
		});

		it('prioritises the language quick-start and empty when the use case has no language match', () => {
			const result = getTemplateRecommendation(templates, AUTOMATION, 'javascript');

			expect(ids(result).slice(0, 2)).toEqual(['js-crawlee-cheerio', 'js-empty']);
		});
	});

	describe('any language + use case', () => {
		it('treats any use-case match as exact regardless of language', () => {
			const result = getTemplateRecommendation(templates, WEB_SCRAPING, ANY_TEMPLATE_LANGUAGE);

			expect(exactIds(result)).toEqual([
				'js-crawlee-cheerio',
				'js-scraper',
				'ts-crawlee-cheerio',
				'python-crawlee-beautifulsoup',
			]);
		});

		it('falls back to all quick-starts then all empties', () => {
			const result = getTemplateRecommendation(templates, AI, ANY_TEMPLATE_LANGUAGE);

			// Only python-ai is exact; then all three quick-starts, then all three empties.
			expect(exactIds(result)).toEqual(['python-ai']);
			expect(ids(result).slice(0, 7)).toEqual([
				'python-ai',
				'js-crawlee-cheerio',
				'ts-crawlee-cheerio',
				'python-crawlee-beautifulsoup',
				'js-empty',
				'ts-empty',
				'python-empty',
			]);
		});
	});

	describe('skip use case (show all)', () => {
		it('treats a language-only match as exact when the use case is skipped', () => {
			const result = getTemplateRecommendation(templates, undefined, 'typescript');

			expect(exactIds(result)).toEqual(['ts-crawlee-cheerio', 'ts-empty', 'ts-automation']);
		});

		it('marks everything exact when both filters are skipped', () => {
			const result = getTemplateRecommendation(templates, undefined, ANY_TEMPLATE_LANGUAGE);

			expect(result.every((r) => r.isExactMatch)).toBe(true);
			expect(ids(result)).toEqual(templates.map((t) => t.id));
		});
	});

	describe('BYO-Docker / other language', () => {
		it('finds no exact match and falls through to use-case then all templates', () => {
			const result = getTemplateRecommendation(templates, WEB_SCRAPING, 'other');

			expect(exactIds(result)).toEqual([]);
			// use-case matches (any language) come before the remaining templates.
			expect(ids(result).slice(0, 4)).toEqual([
				'js-crawlee-cheerio',
				'js-scraper',
				'ts-crawlee-cheerio',
				'python-crawlee-beautifulsoup',
			]);
			expect(result).toHaveLength(templates.length);
		});
	});

	it('never treats a template without useCases as an exact match', () => {
		const result = getTemplateRecommendation(templates, WEB_SCRAPING, 'python');
		const noUseCases = result.find((r) => r.template.id === 'no-usecases');

		expect(noUseCases?.isExactMatch).toBe(false);
	});

	it('returns an empty array for an empty template list', () => {
		expect(getTemplateRecommendation([], WEB_SCRAPING, 'python')).toEqual([]);
	});
});
