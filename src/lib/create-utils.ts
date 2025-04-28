import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import chalk from 'chalk';
import inquirer from 'inquirer';

import type { Manifest, Template } from '@apify/actor-templates';

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
	const answer = await inquirer.prompt<{
		actorName: string;
	}>([
		{
			name: 'actorName',
			message: 'Name of your new Actor:',
			type: 'input',
			validate: (promptText) => {
				try {
					validateActorName(promptText);
				} catch (err) {
					return (err as Error).message;
				}
				return true;
			},
		},
	]);

	return answer.actorName;
}

async function promptProgrammingLanguage() {
	const answer = await inquirer.prompt<{
		programmingLanguage: string;
	}>([
		{
			type: 'list',
			name: 'programmingLanguage',
			message: 'Choose the programming language of your new Actor:',
			default: PROGRAMMING_LANGUAGES[0],
			choices: PROGRAMMING_LANGUAGES,
			loop: false,
		},
	]);
	return answer.programmingLanguage;
}

async function promptTemplateDefinition(manifest: Manifest, programmingLanguage: string): Promise<Template | false> {
	const choices = [
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

		new inquirer.Separator(),

		{
			name: 'Go back',
			value: false,
		},
	];

	const answer = await inquirer.prompt([
		{
			type: 'list',
			name: 'templateDefinition',
			message:
				'Choose a template for your new Actor. Detailed information about the template will be shown in the next step.',
			default: choices[0],
			choices,
			loop: false,
			pageSize: 8,
		},
	]);

	return answer.templateDefinition;
}

async function promptTemplateInstallation(templateDefinition: Template) {
	const choices = [
		{ name: `Install template`, value: true },
		new inquirer.Separator(),
		{ name: 'Go back', value: false },
	];

	const label = chalk.underline(templateDefinition.label);
	const description = chalk.dim(templateDefinition.description);
	const suffix = `\n ${label}:\n ${description}`;
	const message = `Do you want to install the following template?${suffix}`;

	const answer = await inquirer.prompt<{ shouldInstall: boolean }>([
		{
			type: 'list',
			name: 'shouldInstall',
			message,
			default: choices[0],
			choices,
			loop: false,
		},
	]);

	return answer.shouldInstall;
}
