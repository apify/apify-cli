import { readFile, writeFile } from 'node:fs/promises';

import chalk from 'chalk';

import { Commands } from './commands';
import { registerCommandForHelpGeneration, selectiveRenderHelpForCommand } from '../../src/lib/command-framework/help';
import type { BaseCommandRenderer } from '../../src/lib/command-framework/help/_BaseCommandRenderer';

export interface CommandsInCategory extends Partial<Parameters<BaseCommandRenderer['selectiveRender']>[0]> {
	command: (typeof Commands)[keyof typeof Commands];
	aliases?: (typeof Commands)[keyof typeof Commands][];
}

const templateFilePath = new URL('../reference-template.md', import.meta.url);
const finalOutputFilePath = new URL('../../docs/reference.md', import.meta.url);

const allCommands = new Set(Object.values(Commands).filter((command) => !command.hidden));

function fullCommandName(command: (typeof Commands)[keyof typeof Commands]) {
	if (Reflect.ownKeys(command).includes('parent')) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { parent, name } = command as any;
		return `${parent.name} ${name}`;
	}

	return command.name;
}

chalk.level = 0;

export async function renderDocs(categories: Record<string, CommandsInCategory[]>) {
	// render description in code block, then usage, no short description after command header
	let templateFile = await readFile(templateFilePath, 'utf8');

	for (const [category, commands] of Object.entries(categories)) {
		const startString = `<!-- ${category}-commands-start -->`;
		const endString = `<!-- ${category}-commands-end -->`;

		if (!templateFile.includes(startString)) {
			throw new Error(`Category ${category} has no start placeholder in reference template!`);
		}

		if (templateFile.includes(startString) && !templateFile.includes(endString)) {
			throw new Error(
				`Category ${category} has a start placeholder but no end placeholder in reference template!`,
			);
		}

		const commandList: string[] = [];

		for (const [
			index,
			{ command, aliases, showDescription = true, showSubcommands = true, showUsageString = true },
		] of commands.entries()) {
			if (!command) {
				throw new Error(`Command at index ${index} is undefined for ${category} category!`);
			}

			allCommands.delete(command);

			const stringParts: string[] = [];

			registerCommandForHelpGeneration('apify', command);

			const commandHeaderParts = [fullCommandName(command)];

			if (aliases?.length) {
				for (const alias of aliases) {
					allCommands.delete(alias);
					commandHeaderParts.push(fullCommandName(alias));
				}
			}

			stringParts.push(`##### ${commandHeaderParts.map((part) => `\`apify ${part}\``).join(' / ')}`);

			const codeBlockParts: string[] = [];

			if (showDescription) {
				const result = selectiveRenderHelpForCommand(command, { showDescription: true });
				if (result) {
					codeBlockParts.push(result);
				}
			}

			if (showUsageString) {
				const result = selectiveRenderHelpForCommand(command, { showUsageString: true });
				if (result) {
					codeBlockParts.push(result);
				}
			}

			if (showSubcommands) {
				const result = selectiveRenderHelpForCommand(command, { showSubcommands: true });
				if (result) {
					codeBlockParts.push(result);
				}
			}

			stringParts.push(`\`\`\`sh\n${codeBlockParts.join('\n\n').trim()}\n\`\`\``);

			commandList.push(stringParts.join('\n\n').trim());
		}

		templateFile = templateFile.replace(startString, `${startString}\n${commandList.join('\n\n')}`);
	}

	if (allCommands.size) {
		throw new Error(
			`The following commands were not rendered because they are not registered for help generation:\n${[...allCommands].map((command) => `- ${fullCommandName(command)}`).join('\n')}`,
		);
	}

	await writeFile(finalOutputFilePath, templateFile);
}
