import type { Template } from '@apify/actor-templates';

import { ANY_TEMPLATE_LANGUAGE, EMPTY_TEMPLATE_IDS, QUICK_START_TEMPLATE_IDS } from './consts.js';

export interface TemplateRecommendation {
	template: Template;
	/** True when this template matches every active filter (language and/or use case). */
	isExactMatch: boolean;
}

/**
 * Ports apify-core's `getTemplateRecommendation`
 * (`src/console/frontend/src/ui/actors/actor_new_wizard/get_template_recommendation.ts`),
 * with two CLI-specific changes:
 *
 * - The return shape is a flat, priority-ordered `Array<{ template, isExactMatch }>` — a
 *   per-template flag rather than the upstream aggregate `{ templates, isExactMatch }`.
 * - `useCaseId` is optional: `undefined` means "no use-case filter" (the wizard's
 *   "Skip (show all)" choice), mirroring how {@link ANY_TEMPLATE_LANGUAGE} means
 *   "no language filter".
 *
 * Templates are returned most- to least-fitting: exact matches first (in manifest order),
 * then the language quick-start and empty templates, then same-language, then same-use-case,
 * then everything else. Results are de-duplicated by `template.id`, preserving first insertion.
 */
export function getTemplateRecommendation(
	templates: Template[],
	useCaseId: string | undefined,
	languageId: string,
): TemplateRecommendation[] {
	const hasLanguageFilter = languageId !== ANY_TEMPLATE_LANGUAGE;
	const hasUseCaseFilter = useCaseId !== undefined;

	const matchesLanguage = (template: Template) => !hasLanguageFilter || template.category === languageId;
	const matchesUseCase = (template: Template) => !hasUseCaseFilter || (template.useCases?.includes(useCaseId) ?? false);
	const isExactMatch = (template: Template) => matchesLanguage(template) && matchesUseCase(template);

	const pickedIds = new Set<string>();
	const picked: Template[] = [];

	const addCandidates = (candidates: Template[]) => {
		for (const candidate of candidates) {
			if (!pickedIds.has(candidate.id)) {
				pickedIds.add(candidate.id);
				picked.push(candidate);
			}
		}
	};

	// Adds the curated template(s) from an id-per-language map: just the selected language's entry,
	// or all of them when the language is "any". Missing entries match nothing.
	const addCuratedTemplates = (idMap: Record<string, string | undefined>) => {
		const ids = hasLanguageFilter ? [idMap[languageId]] : Object.values(idMap);
		addCandidates(templates.filter((template) => ids.includes(template.id)));
	};

	// 1. Exact matches: everything the active filters accept.
	addCandidates(templates.filter(isExactMatch));

	// 2. Quick-start starter(s), then 3. empty template(s): curated per-language fallbacks.
	addCuratedTemplates(QUICK_START_TEMPLATE_IDS);
	addCuratedTemplates(EMPTY_TEMPLATE_IDS);

	// 4. Same language, any use case.
	if (hasLanguageFilter) {
		addCandidates(templates.filter(matchesLanguage));
	}

	// 5. Same use case, any language.
	if (hasUseCaseFilter) {
		addCandidates(templates.filter(matchesUseCase));
	}

	// 6. Anything else, so the list is never shorter than the input.
	addCandidates(templates);

	return picked.map((template) => ({ template, isExactMatch: isExactMatch(template) }));
}
