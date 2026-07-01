import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';

import { ApifyCommand, commandRegistry } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { renderHelpForCommand, renderMainHelpMenu } from '../lib/command-framework/help.js';
import { useCommandSuggestions } from '../lib/hooks/useCommandSuggestions.js';
import { error, simpleLog } from '../lib/outputs.js';

declare const __APIFY_CLI_SKILL__: string | undefined;

const SKILL_RELATIVE_PATH = join('skills', 'apify', 'SKILL.md');

function readApifySkill(): string | null {
	if (typeof __APIFY_CLI_SKILL__ === 'string' && __APIFY_CLI_SKILL__) {
		return __APIFY_CLI_SKILL__;
	}

	let dir = dirname(fileURLToPath(import.meta.url));

	while (true) {
		const candidate = join(dir, SKILL_RELATIVE_PATH);

		if (existsSync(candidate)) {
			return readFileSync(candidate, 'utf-8');
		}

		const parent = dirname(dir);

		if (parent === dir) {
			return null;
		}

		dir = parent;
	}
}

export class HelpCommand extends ApifyCommand<typeof HelpCommand> {
	static override name = 'help' as const;

	static override description = 'Prints out help about a command, or all available commands.';

	static override hidden = true;

	static override args = {
		commandString: Args.string({
			required: false,
			description: 'The command to get help for.',
			catchAll: true,
		}),
	};

	static override flags = {
		skill: Flags.boolean({
			description: 'Print the Apify CLI agent skill (guidance for driving `apify` from agents).',
			default: false,
		}),
	};

	async run() {
		const { commandString } = this.args;

		if (this.flags.skill) {
			const skill = readApifySkill();

			if (!skill) {
				error({ message: 'Could not find the Apify CLI skill file.' });

				return;
			}

			simpleLog({ stdout: true, message: skill.trimEnd() });

			return;
		}

		if (!commandString || commandString.toLowerCase().startsWith('help')) {
			const helpMenu = renderMainHelpMenu(this.entrypoint);

			console.log(helpMenu);

			return;
		}

		const lowercasedCommandString = commandString.toLowerCase();

		const command = commandRegistry.get(lowercasedCommandString);

		if (!command) {
			const closestMatches = useCommandSuggestions(lowercasedCommandString);

			let message = chalk.gray(`Command ${chalk.whiteBright(commandString)} not found`);

			if (closestMatches.length) {
				message += '\n  ';
				message += chalk.gray(`Did you mean: ${closestMatches.map((cmd) => chalk.whiteBright(cmd)).join(', ')}?`);
			}

			error({
				message,
			});

			return;
		}

		const helpMenu = renderHelpForCommand(command);

		console.log(helpMenu);
	}
}
