import chalk from 'chalk';

import { ApifyCommand, commandRegistry } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { renderHelpForCommand, renderMainHelpMenu } from '../lib/command-framework/help.js';
import { useCommandSuggestions } from '../lib/hooks/useCommandSuggestions.js';
import { error } from '../lib/outputs.js';

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

	async run() {
		const { commandString } = this.args;

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
				message += chalk.gray(
					`Did you mean: ${closestMatches.map((cmd) => chalk.whiteBright(cmd)).join(', ')}?`,
				);
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
