import {
	LANGUAGE_FLAG_CHOICES,
	languageFlagToTag,
	languageLabel,
	TEMPLATE_USE_CASES,
	USE_CASE_FLAG_CHOICES,
	useCaseFlagToTag,
	useCaseLabel,
} from '../../../src/lib/templates/consts.js';

describe('template flag mappings', () => {
	it('maps each --use-case flag value to its manifest tag', () => {
		expect(useCaseFlagToTag('web-scraper')).toBe(TEMPLATE_USE_CASES.WEB_SCRAPING);
		expect(useCaseFlagToTag('ai-agent')).toBe(TEMPLATE_USE_CASES.AI);
		expect(useCaseFlagToTag('data-pipeline')).toBe(TEMPLATE_USE_CASES.INTEGRATION);
		expect(useCaseFlagToTag('browser-automation')).toBe(TEMPLATE_USE_CASES.AUTOMATION);
	});

	it('returns undefined for an unknown use-case flag', () => {
		expect(useCaseFlagToTag('nonsense')).toBeUndefined();
	});

	it('never exposes STARTER as a use-case flag, and every choice maps to a real tag', () => {
		expect(USE_CASE_FLAG_CHOICES).not.toContain('starter');
		for (const flag of USE_CASE_FLAG_CHOICES) {
			expect(useCaseFlagToTag(flag)).toBeDefined();
		}
	});

	it('accepts each language and its alias', () => {
		expect(LANGUAGE_FLAG_CHOICES).toEqual(['javascript', 'js', 'typescript', 'ts', 'python', 'py']);
	});

	it('maps language aliases and canonical values to the manifest tag', () => {
		expect(languageFlagToTag('js')).toBe('javascript');
		expect(languageFlagToTag('ts')).toBe('typescript');
		expect(languageFlagToTag('py')).toBe('python');
		expect(languageFlagToTag('python')).toBe('python');
		expect(languageFlagToTag('nonsense')).toBeUndefined();
	});

	it('labels use cases and languages for the "no exact match" hint', () => {
		expect(useCaseLabel(TEMPLATE_USE_CASES.AUTOMATION)).toBe('Browser automation');
		expect(languageLabel('javascript')).toBe('JavaScript');
	});
});
