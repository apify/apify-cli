import type { Template } from '@apify/actor-templates';

import { ANY_TEMPLATE_LANGUAGE, TEMPLATE_USE_CASES } from '../../../src/lib/templates/consts.js';
import { getTemplateRecommendation } from '../../../src/lib/templates/getTemplateRecommendation.js';
import { buildTemplateChoiceList, NON_EXACT_SEPARATOR_LABEL } from '../../../src/lib/templates/templateChoices.js';

function makeTemplate(id: string, category: string, label: string, useCases?: string[]): Template {
	return {
		id,
		name: id,
		label,
		category,
		technologies: [],
		description: `Description ${id}`,
		archiveUrl: `https://example.com/${id}.zip`,
		...(useCases ? { useCases } : {}),
	};
}

const { WEB_SCRAPING, AUTOMATION, STARTER, INTEGRATION } = TEMPLATE_USE_CASES;

const templates: Template[] = [
	makeTemplate('python-crawlee-beautifulsoup', 'python', 'Crawlee + BeautifulSoup', [WEB_SCRAPING, STARTER]),
	makeTemplate('python-empty', 'python', 'Empty Python project', [STARTER]),
	makeTemplate('python-standby', 'python', 'Standby Python project', [INTEGRATION]),
	makeTemplate('js-crawlee-cheerio', 'javascript', 'Crawlee + Cheerio', [WEB_SCRAPING, STARTER]),
	makeTemplate('js-empty', 'javascript', 'Empty JavaScript project', [STARTER]),
];

function buildFor(useCaseId: string | undefined, languageId: string) {
	return buildTemplateChoiceList(getTemplateRecommendation(templates, useCaseId, languageId), useCaseId, languageId);
}

describe('buildTemplateChoiceList', () => {
	it('places the separator right before the first non-exact template', () => {
		const list = buildFor(WEB_SCRAPING, 'python');

		// python-crawlee-beautifulsoup is the only exact match, so the separator goes at index 1.
		expect(list.separatorIndex).toBe(1);
		expect(list.rows[0]).toMatchObject({ isExactMatch: true, template: { id: 'python-crawlee-beautifulsoup' } });
		expect(list.rows[1].isExactMatch).toBe(false);
		expect(list.noExactMatchHint).toBeNull();
	});

	it('omits the suffix for same-language templates', () => {
		const list = buildFor(WEB_SCRAPING, 'python');

		expect(list.rows[0].label).toBe('Crawlee + BeautifulSoup');
	});

	it('adds a (Language) suffix for cross-language templates', () => {
		const list = buildFor(WEB_SCRAPING, 'python');
		const jsRow = list.rows.find((row) => row.template.id === 'js-crawlee-cheerio');

		expect(jsRow?.label).toBe('Crawlee + Cheerio (JavaScript)');
	});

	it('adds a suffix to every row when any language is selected', () => {
		const list = buildFor(WEB_SCRAPING, ANY_TEMPLATE_LANGUAGE);

		expect(list.rows.every((row) => / \(\w/.test(row.label))).toBe(true);
	});

	it('has no separator when every template is an exact match', () => {
		const list = buildFor(undefined, ANY_TEMPLATE_LANGUAGE);

		expect(list.separatorIndex).toBeNull();
		expect(list.noExactMatchHint).toBeNull();
		expect(list.rows.every((row) => row.isExactMatch)).toBe(true);
	});

	it('emits a hint and no separator when nothing matches exactly', () => {
		// AUTOMATION + javascript has no exact match in this fixture.
		const list = buildFor(AUTOMATION, 'javascript');

		expect(list.separatorIndex).toBeNull();
		expect(list.rows.every((row) => !row.isExactMatch)).toBe(true);
		expect(list.noExactMatchHint).toBe(
			'No template matches Browser automation + JavaScript exactly — showing the closest alternatives.',
		);
	});

	it('describes a skipped use case with only the language in the hint', () => {
		const list = buildFor(undefined, 'other');

		expect(list.noExactMatchHint).toBe('No template matches other exactly — showing the closest alternatives.');
	});

	it('uses the agreed separator label', () => {
		expect(NON_EXACT_SEPARATOR_LABEL).toContain("don't exactly match your selection");
	});
});
