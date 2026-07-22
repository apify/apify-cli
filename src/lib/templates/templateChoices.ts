import type { Template } from '@apify/actor-templates';

import { ANY_TEMPLATE_LANGUAGE, LANGUAGE_OPTIONS, languageLabel, useCaseLabel } from './consts.js';
import type { TemplateRecommendation } from './getTemplateRecommendation.js';

/** Label of the non-selectable row that separates exact matches from the closest alternatives. */
export const NON_EXACT_SEPARATOR_LABEL = "── The templates below don't exactly match your selection ──";

export interface TemplateChoiceRow {
	template: Template;
	/** Display name, with a `(Language)` suffix when it differs from the user's selection. */
	label: string;
	isExactMatch: boolean;
}

export interface TemplateChoiceList {
	rows: TemplateChoiceRow[];
	/**
	 * Index in `rows` before which the non-exact separator should be inserted (the first
	 * non-exact template), or `null` when no separator is needed.
	 */
	separatorIndex: number | null;
	/** Info line to show above the list when nothing matched exactly, or `null`. */
	noExactMatchHint: string | null;
}

/**
 * Turns a priority-ordered recommendation into the data a single-list template prompt needs:
 * per-row labels, where to draw the "closest alternatives" separator, and the "no exact match"
 * hint. Kept free of any prompt library so it can be unit-tested directly.
 */
export function buildTemplateChoiceList(
	recommendations: TemplateRecommendation[],
	useCaseId: string | undefined,
	languageId: string,
): TemplateChoiceList {
	const hasExactMatch = recommendations.some((recommendation) => recommendation.isExactMatch);

	const rows: TemplateChoiceRow[] = recommendations.map(({ template, isExactMatch }) => ({
		template,
		label: formatTemplateLabel(template, languageId),
		isExactMatch,
	}));

	const firstNonExactIndex = rows.findIndex((row) => !row.isExactMatch);
	const separatorIndex = hasExactMatch && firstNonExactIndex > 0 ? firstNonExactIndex : null;

	const noExactMatchHint =
		!hasExactMatch && rows.length > 0
			? `No template matches ${describeSelection(useCaseId, languageId)} exactly — showing the closest alternatives.`
			: null;

	return { rows, separatorIndex, noExactMatchHint };
}

/** Appends a `(Language)` suffix when the template's language differs from the user's selection. */
function formatTemplateLabel(template: Template, selectedLanguageId: string): string {
	const label = LANGUAGE_OPTIONS.find((option) => option.id === template.category)?.label;
	const differentLanguage = selectedLanguageId === ANY_TEMPLATE_LANGUAGE || template.category !== selectedLanguageId;

	return label && differentLanguage ? `${template.label} (${label})` : template.label;
}

/** Human-readable "<use case> + <language>" description for the "no exact match" hint. */
function describeSelection(useCaseId: string | undefined, languageId: string): string {
	const parts: string[] = [];
	if (useCaseId) parts.push(useCaseLabel(useCaseId));
	parts.push(languageLabel(languageId));

	return parts.join(' + ');
}
