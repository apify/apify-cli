import { appendFile } from 'node:fs/promises';

import { Separator } from '@inquirer/core';
import axios from 'axios';

import type { Manifest, Template } from '@apify/actor-templates';

import type { ChoicesType } from './hooks/user-confirmations/useSelectFromList.js';
import { useSelectFromList } from './hooks/user-confirmations/useSelectFromList.js';
import { useUserInput } from './hooks/user-confirmations/useUserInput.js';
import { info, warning } from './outputs.js';
import { ANY_TEMPLATE_LANGUAGE, LANGUAGE_OPTIONS, USE_CASE_OPTIONS, useCaseFlagToId } from './templates/consts.js';
import { getTemplateRecommendation } from './templates/getTemplateRecommendation.js';
import { buildTemplateChoiceList, NON_EXACT_SEPARATOR_LABEL } from './templates/templateChoices.js';
import { validateActorName } from './utils.js';

/** Filters coming from the `--use-case` / `--language` flags. `undefined` means "not provided". */
export interface TemplateFilters {
	useCase?: string;
	language?: string;
}

export async function ensureValidActorName(maybeActorName?: string) {
	if (maybeActorName) {
		validateActorName(maybeActorName);
		return maybeActorName;
	}

	return promptActorName();
}

export async function getTemplateDefinition(
	maybeTemplateName: string | undefined,
	manifestPromise: Promise<Manifest | Error>,
	filters: TemplateFilters = {},
) {
	const manifest = await manifestPromise;
	// If the fetch failed earlier, the resolve value of
	// the promise will be the error from fetching the manifest.
	if (manifest instanceof Error) throw manifest;

	if (maybeTemplateName) {
		const templateDefinition = manifest.templates.find((t) => t.name === maybeTemplateName);
		if (!templateDefinition) {
			throw new Error(`Could not find the selected template: ${maybeTemplateName} in the list of templates.`);
		}
		return templateDefinition;
	}

	return executePrompts(manifest, filters);
}

/**
 * Fetch local readme suffix from the manifest and append it to the readme.
 */
export async function enhanceReadmeWithLocalSuffix(readmePath: string, manifestPromise: Promise<Manifest | Error>) {
	const manifest = await manifestPromise;
	// If the fetch failed earlier, the resolve value of
	// the promise will be the error from fetching the manifest.
	if (manifest instanceof Error) throw manifest;

	try {
		const response = await axios.get<string>(manifest.localReadmeSuffixUrl!, { responseType: 'text' });

		await appendFile(readmePath, `\n\n${response.data}`);
	} catch (err) {
		warning({
			message: `Could not append local development instructions to README.md. Cause: ${(err as Error).message}`,
		});
	}
}

export function buildNextSteps(params: {
	actorName: string;
	dependenciesInstalled: boolean;
	installCommandSuggestion?: string | null;
}): string[] {
	const { actorName, dependenciesInstalled, installCommandSuggestion } = params;

	const steps = [`cd "${actorName}"`];
	if (!dependenciesInstalled) {
		steps.push(installCommandSuggestion || 'install dependencies with your package manager');
	}
	steps.push('apify run');

	return steps;
}

export function formatCreateSuccessMessage(params: {
	actorName: string;
	dependenciesInstalled: boolean;
	postCreate?: string | null;
	gitRepositoryInitialized?: boolean;
	installCommandSuggestion?: string | null;
}) {
	const { actorName, dependenciesInstalled, postCreate, gitRepositoryInitialized, installCommandSuggestion } = params;

	let message = `✅ Actor '${actorName}' created successfully!`;

	const nextSteps = buildNextSteps({ actorName, dependenciesInstalled, installCommandSuggestion });
	message += `\n\nNext steps:\n\n${nextSteps.join('\n')}`;

	message += `\n\n💡 Tip: Use 'apify push' to deploy your Actor to the Apify platform\n📖 Docs: https://docs.apify.com/platform/actors/development`;

	if (gitRepositoryInitialized) {
		message += `\n🌱 Git repository initialized in '${actorName}'. You can now commit and push your Actor to Git.`;
	}

	if (postCreate) {
		message += `\n\n${postCreate}`;
	}

	return message;
}

/**
 * Guided wizard: ask what the user wants to build and in which language (unless supplied via
 * flags), then present the best-matching templates ordered by fit.
 */
async function executePrompts(manifest: Manifest, filters: TemplateFilters) {
	const useCaseId = filters.useCase ? useCaseFlagToId(filters.useCase) : await promptUseCase();
	// A provided `--language` value is already a manifest `category` (or the `other` marker).
	const languageId = filters.language ?? (await promptLanguage());

	return promptTemplate(manifest, useCaseId, languageId);
}

async function promptActorName() {
	const answer = await useUserInput({
		message: 'Name of your new Actor:',
		validate: (promptText) => {
			try {
				validateActorName(promptText);
			} catch (err) {
				return (err as Error).message;
			}
			return true;
		},
	});

	return answer;
}

async function promptUseCase(): Promise<string | undefined> {
	const choices: ChoicesType<string | null> = [
		...USE_CASE_OPTIONS.map((option) => ({ name: option.label, value: option.id })),
		new Separator(),
		{ name: 'Skip (show all)', value: null },
	];

	const useCaseId = await useSelectFromList<string | null>({
		message: 'What do you want to build?',
		choices,
		default: USE_CASE_OPTIONS[0].id,
		loop: false,
	});

	// `null` is the "Skip (show all)" choice — the algorithm treats a missing use case as no filter.
	return useCaseId ?? undefined;
}

async function promptLanguage(): Promise<string> {
	const choices: ChoicesType<string> = [
		...LANGUAGE_OPTIONS.map((option) => ({ name: option.label, value: option.id })),
		new Separator(),
		{ name: 'Any language', value: ANY_TEMPLATE_LANGUAGE },
	];

	return useSelectFromList<string>({
		message: 'Choose the programming language of your new Actor:',
		choices,
		default: LANGUAGE_OPTIONS[0].id,
		loop: false,
	});
}

/**
 * Renders one scrollable list ordered by fit: exact matches first (top one preselected), then a
 * non-selectable separator, then the closest alternatives. When nothing matches exactly, an info
 * line explains that the closest alternatives are shown instead.
 */
async function promptTemplate(
	manifest: Manifest,
	useCaseId: string | undefined,
	languageId: string,
): Promise<Template> {
	const recommendations = getTemplateRecommendation(manifest.templates, useCaseId, languageId);
	const { rows, separatorIndex, noExactMatchHint } = buildTemplateChoiceList(recommendations, useCaseId, languageId);

	if (rows.length === 0) {
		throw new Error('No Actor templates are available right now. Please try again later.');
	}

	const choices: NonNullable<ChoicesType<Template>>[number][] = [];
	rows.forEach((row, index) => {
		if (index === separatorIndex) {
			choices.push(new Separator(NON_EXACT_SEPARATOR_LABEL));
		}

		choices.push({ name: row.label, value: row.template });
	});

	if (noExactMatchHint) {
		info({ message: noExactMatchHint, stdout: false });
	}

	return useSelectFromList<Template>({
		message: 'Choose a template for your new Actor. More info at https://apify.com/templates',
		choices,
		default: rows[0].template,
		loop: false,
		pageSize: 8,
	});
}
