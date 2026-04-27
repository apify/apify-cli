import chalk from 'chalk';
import indentString from 'indent-string';
import widestLine from 'widest-line';
import wrapAnsi from 'wrap-ansi';

import { useCLIMetadata } from '../hooks/useCLIMetadata.js';
import { logger } from '../logger.js';
import type { BuiltApifyCommand } from './apify-command.js';
import type { BaseCommandRenderer, SelectiveRenderOptions } from './help/_BaseCommandRenderer.js';
import { CommandHelp } from './help/CommandHelp.js';
import { CommandWithSubcommandsHelp } from './help/CommandWithSubcommands.js';
import { getMaxLineWidth } from './help/consts.js';

const commands = new Map<typeof BuiltApifyCommand, BaseCommandRenderer>();

export function registerCommandForHelpGeneration(entrypoint: string, command: typeof BuiltApifyCommand) {
	if (command.name.toLowerCase() !== command.name) {
		logger.stderr.error(
			`Command name "${command.name}" is not correctly set up internally. Make sure you fill out the "name" field in the command class extension.`,
		);

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

/**
 * Ordered list of groups shown in the main help menu. The order here determines
 * the order groups appear on screen.
 */
const GROUP_ORDER = ['Local Actor Development', 'Apify Console', 'Authentication', 'Utilities'] as const;
const OTHER_GROUP = 'Other';

/**
 * Canonical example invocations shown at the bottom of the main help screen.
 * Kept short and representative of typical user flows. Descriptions render as
 * shell-style `#` comments above the command (matches the per-command EXAMPLES
 * rendering) and should be used to flag interactive flows whose bare form might
 * otherwise look incomplete.
 */
const APIFY_EXAMPLES: { description?: string; command: string }[] = [
	{ command: 'apify login' },
	{
		description: 'Walks you interactively through the Actor creation flow.',
		command: 'apify create',
	},
	{ command: 'apify run' },
	{ command: 'apify push' },
	{ command: 'apify actors search "web scraper"' },
];

const ACTOR_EXAMPLES: { description?: string; command: string }[] = [
	{ command: 'actor get-input' },
	{ command: `actor push-data '{"url":"https://example.com"}'` },
	{ command: `actor set-value OUTPUT '{"done":true}'` },
];

export function renderMainHelpMenu(entrypoint: string) {
	const cliMetadata = useCLIMetadata();
	const result: string[] = [];

	if (entrypoint === 'actor') {
		result.push(
			`'actor' is the runtime CLI baked into Apify Actor Docker images. It exposes a reduced command set intended for use from inside a running Actor. When available, these commands are equivalent to 'apify actor <subcommand>'.`,
			'',
		);
	} else {
		result.push(
			'Apify command-line interface (CLI) helps you manage the Apify cloud platform and develop, build, and deploy Apify Actors.',
			'',
		);
	}

	result.push(chalk.bold('VERSION'));
	result.push(`  ${cliMetadata.fullVersionString}`);
	result.push('');

	result.push(chalk.bold('USAGE'));
	result.push(`  $ ${entrypoint} <command> [options]`);
	result.push('');

	// Collect top-level (non-hidden, no-parent) commands — leaves and namespaces alike share groups.
	const topLevelCommands: [typeof BuiltApifyCommand, BaseCommandRenderer][] = [];
	for (const [command, helpGenerator] of commands) {
		// Subcommand help generators have a space in their entrypoint ("apify runs"); skip those.
		if (helpGenerator.entrypoint.includes(' ')) continue;
		if (command.hidden) continue;
		topLevelCommands.push([command, helpGenerator]);
	}

	// Group commands by their static `group` field (falling back to OTHER_GROUP)
	const byGroup = new Map<string, [typeof BuiltApifyCommand, BaseCommandRenderer][]>();
	for (const entry of topLevelCommands) {
		const [command] = entry;
		const group = command.group || OTHER_GROUP;
		if (!byGroup.has(group)) byGroup.set(group, []);
		byGroup.get(group)!.push(entry);
	}

	// Sort group contents alphabetically
	for (const entries of byGroup.values()) {
		entries.sort(sortByName);
	}

	// Render groups in canonical order, then any remaining groups (alphabetical), then OTHER last
	const orderedGroupNames: string[] = [];
	for (const g of GROUP_ORDER) {
		if (byGroup.has(g)) orderedGroupNames.push(g);
	}
	const extraGroups = [...byGroup.keys()]
		.filter((g) => !GROUP_ORDER.includes(g as (typeof GROUP_ORDER)[number]) && g !== OTHER_GROUP)
		.sort();
	orderedGroupNames.push(...extraGroups);
	if (byGroup.has(OTHER_GROUP)) orderedGroupNames.push(OTHER_GROUP);

	// Compute widest command name so description columns align across sections.
	const allNames = topLevelCommands.map(([c]) => c.name).join('\n');
	const widestNameLength = widestLine(allNames) || 1;

	const renderEntry = ([command]: [typeof BuiltApifyCommand, BaseCommandRenderer]): string => {
		const shortDescription = command.shortDescription || command.description?.split('\n')[0] || '';
		const label = command.name.padEnd(widestNameLength);
		const fullString = `${label}  ${shortDescription}`;
		// -4 = 2 leading spaces on the line + 2 spaces between label and description
		const wrapped = wrapAnsi(fullString, getMaxLineWidth() - widestNameLength - 4);
		// Indent so continuation lines line up under the description column (label + 2-space separator + 2 leading)
		return `  ${indentString(wrapped, widestNameLength + 2 + 2).trim()}`;
	};

	for (const groupName of orderedGroupNames) {
		const entries = byGroup.get(groupName)!;
		if (!entries.length) continue;

		result.push(chalk.bold(groupName.toUpperCase()));
		result.push(...entries.map(renderEntry), '');
	}

	const examples = entrypoint === 'actor' ? ACTOR_EXAMPLES : APIFY_EXAMPLES;
	if (examples.length) {
		result.push(chalk.bold('EXAMPLES'));
		for (let i = 0; i < examples.length; i++) {
			const ex = examples[i];
			// Commented entries stand as their own block: blank line before (unless first)
			// and after (unless last) so the `#` comment clearly pairs with its command
			// and doesn't visually bleed into neighbouring bare examples.
			if (ex.description) {
				if (i > 0) result.push('');
				// -4 leaves room for the 2-space indent plus the "# " prefix so
				// continuation lines remain valid shell comments at any terminal width.
				const wrapped = wrapAnsi(ex.description, getMaxLineWidth() - 4, { trim: false });
				const commented = wrapped
					.split('\n')
					.map((line) => `# ${line}`)
					.join('\n');
				result.push(chalk.dim(indentString(commented, 2)));
			}
			result.push(`  $ ${ex.command}`);
			if (ex.description && i < examples.length - 1) result.push('');
		}
		result.push('');
	}

	result.push(
		chalk.bold('LEARN MORE'),
		`  Use '${entrypoint} <command> --help' for more information about a command.`,
		`  Read the docs at https://docs.apify.com/cli.`,
		'',
	);

	result.push(
		chalk.bold('TROUBLESHOOTING'),
		'  For general support, reach out to us at https://apify.com/contact.',
		'  If you believe you are encountering a bug, file it at https://github.com/apify/apify-cli/issues/new.',
	);

	return result.join('\n').trim();
}
