import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { Separator } from '@inquirer/core';
import chalk from 'chalk';

import type { Manifest, Template } from '@apify/actor-templates';

import type { ChoicesType } from './hooks/user-confirmations/useSelectFromList.js';
import { useSelectFromList } from './hooks/user-confirmations/useSelectFromList.js';
import { useUserInput } from './hooks/user-confirmations/useUserInput.js';
import { warning } from './outputs.js';
import { httpsGet, validateActorName } from './utils.js';

const PROGRAMMING_LANGUAGES = ['JavaScript', 'TypeScript', 'Python'];

export async function ensureValidActorName(maybeActorName?: string) {
	if (maybeActorName) {
		validateActorName(maybeActorName);
		return maybeActorName;
	}

	return promptActorName();
}

// TODO: this isn't even used anymore
export async function getTemplateDefinition(
	maybeTemplateName: string | undefined,
	manifestPromise: Promise<Manifest | Error>,
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

	return executePrompts(manifest);
}

// TODO: this isn't even used anymore
/**
 * Fetch local readme suffix from the manifest and append it to the readme.
 */
export async function enhanceReadmeWithLocalSuffix(readmePath: string, manifestPromise: Promise<Manifest | Error>) {
	const manifest = await manifestPromise;
	// If the fetch failed earlier, the resolve value of
	// the promise will be the error from fetching the manifest.
	if (manifest instanceof Error) throw manifest;

	try {
		const suffixStream = await httpsGet(manifest.localReadmeSuffixUrl!);
		const readmeStream = createWriteStream(readmePath, { flags: 'a' });
		readmeStream.write('\n\n');
		await pipeline(suffixStream, readmeStream);
	} catch (err) {
		warning({
			message: `Could not append local development instructions to README.md. Cause: ${(err as Error).message}`,
		});
	}
}

/**
 * Inquirer does not have a native way to "go back" between prompts.
 */
async function executePrompts(manifest: Manifest) {
	const programmingLanguage = await promptProgrammingLanguage();

	while (true) {
		const templateDefinition = await promptTemplateDefinition(manifest, programmingLanguage);
		if (templateDefinition) {
			const shouldInstall = await promptTemplateInstallation(templateDefinition);
			if (shouldInstall) {
				return templateDefinition;
			}
		} else {
			return executePrompts(manifest);
		}
	}
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

async function promptProgrammingLanguage() {
	const language = await useSelectFromList<string>({
		message: 'Choose the programming language of your new Actor:',
		choices: PROGRAMMING_LANGUAGES,
		loop: false,
		default: PROGRAMMING_LANGUAGES[0],
	});

	return language;
}

async function promptTemplateDefinition(manifest: Manifest, programmingLanguage: string): Promise<Template | false> {
	const choices: ChoicesType<Template | false> = [
		...manifest.templates
			.filter((t) => {
				return t.category.toLowerCase() === programmingLanguage.toLowerCase();
			})
			.map((t) => {
				return {
					name: t.label,
					value: t,
				};
			}),

		new Separator(),

		{
			name: 'Go back',
			value: false,
		},
	];

	const templateDefinition = await useSelectFromList({
		message:
			'Choose a template for your new Actor. Detailed information about the template will be shown in the next step.',
		default: choices[0],
		choices,
		loop: false,
		pageSize: 8,
	});

	return templateDefinition;
}

async function promptTemplateInstallation(templateDefinition: Template) {
	const choices: ChoicesType<boolean> = [
		{ name: `Install template`, value: true },
		new Separator(),
		{ name: 'Go back', value: false },
	];

	const label = chalk.underline(templateDefinition.label);
	const description = chalk.dim(templateDefinition.description);
	const suffix = `\n ${label}:\n ${description}`;
	const message = `Do you want to install the following template?${suffix}`;

	const answer = await useSelectFromList<boolean>({
		message,
		default: choices[0],
		choices,
		loop: false,
	});

	return answer;
}
