import chalk from 'chalk';
import indentString from 'indent-string';
import widestLine from 'widest-line';
import wrapAnsi from 'wrap-ansi';

import { cliDescription, cliVersion } from '../consts.js';
import { error } from '../outputs.js';
import { mapGroupBy } from '../utils.js';
import type { BuiltApifyCommand } from './apify-command.js';
import type { BaseCommandRenderer, SelectiveRenderOptions } from './help/_BaseCommandRenderer.js';
import { CommandHelp } from './help/CommandHelp.js';
import { CommandWithSubcommandsHelp } from './help/CommandWithSubcommands.js';
import { getMaxLineWidth } from './help/consts.js';

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

		for (const subcommand of command.subcommands) {
			registerCommandForHelpGeneration(`${entrypoint} ${command.name}`, subcommand);
		}
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

export function selectiveRenderHelpForCommand(command: typeof BuiltApifyCommand, options: SelectiveRenderOptions) {
	const renderer = commands.get(command);

	if (!renderer) {
		throw new Error(`No help renderer found for command ${command.name}`);
	}

	return renderer.selectiveRender(options);
}

function sortByName(
	itemA: [typeof BuiltApifyCommand, BaseCommandRenderer],
	itemB: [typeof BuiltApifyCommand, BaseCommandRenderer],
) {
	return itemA[0].name.localeCompare(itemB[0].name);
}

export function renderMainHelpMenu(entrypoint: string) {
	const result: string[] = [];

	result.push(cliDescription, '');

	result.push(chalk.bold('VERSION'));
	result.push(`  ${cliVersion}`);
	result.push('');

	result.push(chalk.bold('USAGE'));
	result.push(`  $ ${entrypoint} <command> [options]`);
	result.push('');

	const allGroupedByType = mapGroupBy(commands, ([command, helpGenerator]) => {
		// We register the help generators for all subcommands with an entrypoint that includes the root command,
		// so we need to ignore those
		if (helpGenerator.entrypoint.includes(' ')) {
			return 'ignored';
		}

		if (command.hidden) {
			return 'ignored';
		}

		if (helpGenerator instanceof CommandWithSubcommandsHelp) {
			return 'subcommand';
		}

		return 'command';
	});

	const groupedSubcommands = allGroupedByType.get('subcommand')?.sort(sortByName);
	const groupedCommands = allGroupedByType.get('command')?.sort(sortByName);

	if (groupedSubcommands?.length) {
		result.push(chalk.bold('TOPICS'));

		const lines: string[] = [];

		const widestTopicNameLength = widestLine(groupedSubcommands.map(([subcommand]) => subcommand.name).join('\n'));

		for (const [subcommand] of groupedSubcommands) {
			if (subcommand.hidden) {
				continue;
			}

			const shortDescription = subcommand.shortDescription || subcommand.description?.split('\n')[0] || '';

			const fullString = `${subcommand.name.padEnd(widestTopicNameLength)}  ${shortDescription}`;

			const wrapped = wrapAnsi(fullString, getMaxLineWidth() - widestTopicNameLength - 2);

			lines.push(`  ${indentString(wrapped, widestTopicNameLength + 2 + 2).trim()}`);
		}

		result.push(...lines, '');
	}

	if (groupedCommands?.length) {
		result.push(chalk.bold('COMMANDS'));

		const lines: string[] = [];

		const widestCommandNameLength = widestLine(groupedCommands.map(([command]) => command.name).join('\n'));

		for (const [command] of groupedCommands) {
			if (command.hidden) {
				continue;
			}

			const shortDescription = command.shortDescription || command.description?.split('\n')[0] || '';

			const fullString = `${command.name.padEnd(widestCommandNameLength)}  ${shortDescription}`;

			const wrapped = wrapAnsi(fullString, getMaxLineWidth() - widestCommandNameLength - 2);

			lines.push(`  ${indentString(wrapped, widestCommandNameLength + 2 + 2).trim()}`);
		}

		result.push(...lines, '');
	}

	result.push(
		chalk.bold('TROUBLESHOOTING'),
		'  For general support, reach out to us at https://apify.com/contact',
		'',
		'  If you believe you are encountering a bug, file it at https://github.com/apify/apify-cli/issues/new',
	);

	return result.join('\n').trim();
}
