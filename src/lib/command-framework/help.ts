import { error } from '../outputs.js';
import type { BuiltApifyCommand } from './apify-command.js';
import type { BaseCommandRenderer } from './help/_BaseCommandRenderer.js';
import { CommandHelp } from './help/CommandHelp.js';
import { CommandWithSubcommandsHelp } from './help/CommandWithSubcommands.js';

const commands = new Map<typeof BuiltApifyCommand, BaseCommandRenderer>();

export function registerCommandForHelpGeneration(entrypoint: string, command: typeof BuiltApifyCommand) {
	if (command.name.toLowerCase() !== command.name) {
		error({
			message: `Command name "${command.name}" is not correctly set up internally. Make sure you fill out the "name" field in the command class extension.`,
		});

		return;
	}

	if (command.subcommands?.length) {
		commands.set(command, new CommandWithSubcommandsHelp(entrypoint, command));
	} else {
		commands.set(command, new CommandHelp(entrypoint, command));
	}
}

export function renderHelpForCommand(command: typeof BuiltApifyCommand) {
	const renderer = commands.get(command);

	if (!renderer) {
		throw new Error(`No help renderer found for command ${command.name}`);
	}

	return renderer.render();
}
