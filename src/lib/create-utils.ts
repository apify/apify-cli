import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { Separator } from '@inquirer/core';

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

export function formatCreateSuccessMessage(params: {
	actorName: string;
	dependenciesInstalled: boolean;
	postCreate?: string | null;
	gitRepositoryInitialized?: boolean;
	installCommandSuggestion?: string | null;
}) {
	const { actorName, dependenciesInstalled, postCreate, gitRepositoryInitialized, installCommandSuggestion } = params;

	let message = `✅ Actor '${actorName}' created successfully!`;

	if (dependenciesInstalled) {
		message += `\n\nNext steps:\n\ncd "${actorName}"\napify run`;
	} else {
		const installLine = installCommandSuggestion || 'install dependencies with your package manager';
		message += `\n\nNext steps:\n\ncd "${actorName}"\n${installLine}\napify run`;
	}

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
 * Inquirer does not have a native way to "go back" between prompts.
 */
async function executePrompts(manifest: Manifest) {
	const programmingLanguage = await promptProgrammingLanguage();

	while (true) {
		const templateDefinition = await promptTemplateDefinition(manifest, programmingLanguage);
		if (templateDefinition) {
			const shouldInstall = await promptTemplateInstallation();
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
		message: 'Choose a template for your new Actor. You can check more information at https://apify.com/templates.',
		default: choices[0],
		choices,
		loop: false,
		pageSize: 8,
	});

	return templateDefinition;
}

async function promptTemplateInstallation() {
	const choices: ChoicesType<boolean> = [
		{ name: `Install dependencies`, value: true },
		new Separator(),
		{ name: 'Go back', value: false },
	];

	const answer = await useSelectFromList<boolean>({
		message: 'Almost done! Last step is to install dependencies.',
		default: choices[0],
		choices,
		loop: false,
	});

	return answer;
}
