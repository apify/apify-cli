import process from 'node:process';

import chalk from 'chalk';
// eslint-disable-next-line import/extensions
import yargs from 'yargs/yargs';

import type { UpgradeCommand as TypeUpgradeCommand } from '../commands/cli-management/upgrade.js';
import {
	camelCaseToKebabCase,
	commandRegistry,
	kebabCaseString,
	runCommand,
} from '../lib/command-framework/apify-command.js';
import type { FlagTag, TaggedFlagBuilder } from '../lib/command-framework/flags.js';
import { renderMainHelpMenu, selectiveRenderHelpForCommand } from '../lib/command-framework/help.js';
import { readStdin } from '../lib/commands/read-stdin.js';
import { useCLIMetadata } from '../lib/hooks/useCLIMetadata.js';
import { shouldSkipVersionCheck } from '../lib/hooks/useCLIVersionCheck.js';
import { useCommandSuggestions } from '../lib/hooks/useCommandSuggestions.js';
import { error } from '../lib/outputs.js';
import { cliDebugPrint } from '../lib/utils/cliDebugPrint.js';

export const cachedStdinInput = await readStdin();

export const cli = yargs()
	.version(false)
	.help(false)
	.parserConfiguration({
		// Disables the automatic conversion of `--foo-bar` to `fooBar` (we handle it manually)
		'camel-case-expansion': false,
		// `--foo.bar` is not allowed
		'dot-notation': false,
		// We parse numbers manually
		'parse-numbers': false,
		'parse-positional-numbers': false,
		'short-option-groups': false,
	})
	.strict()
	.locale('en')
	.updateStrings({
		// Keys come from https://github.com/yargs/yargs/blob/main/locales/en.json
		'Not enough arguments following: %s': 'MISSING_ARGUMENT_INPUT %s',
		// @ts-expect-error @types/yargs is outdated -.-
		'Unknown argument: %s': {
			one: 'UNKNOWN_ARGUMENT_INPUT %s',
			other: 'UNKNOWN_ARGUMENTS_INPUT %s',
		},
		// @ts-expect-error @types/yargs is outdated -.-
		'Not enough non-option arguments: got %s, need at least %s': {
			one: 'NOT_ENOUGH_NON_OPTION_ARGUMENTS_INPUT {"got":%s,"need":%s}',
			other: 'NOT_ENOUGH_NON_OPTION_ARGUMENTS_INPUT {"got":%s,"need":%s}',
		},
		'Arguments %s and %s are mutually exclusive': 'ARGUMENTS_ARE_MUTUALLY_EXCLUSIVE_INPUT ["%s","%s"]',
		'Invalid values:': 'INVALID_VALUES_INPUT',
		'Argument: %s, Given: %s, Choices: %s': 'INVALID_ARGUMENT_OPTION {"argument":"%s","given":%s,"choices":[%s]}',
	})
	.option('help', {
		boolean: true,
		describe: 'Shows this help message.',
		alias: 'h',
	});

// @ts-expect-error @types/yargs is outdated -.-
cli.usageConfiguration({ 'hide-types': true });

cli.middleware(async (argv) => {
	const UpgradeCommand = commandRegistry.get('upgrade') as typeof TypeUpgradeCommand;

	const checkVersionsCommandIds = [UpgradeCommand.name, ...(UpgradeCommand.aliases ?? [])];

	if (checkVersionsCommandIds.some((id) => argv._[0] === id)) {
		// Skip running the middleware
		return;
	}

	// If the user has configured the `APIFY_CLI_SKIP_UPDATE_CHECK` env variable then skip the check.
	if (shouldSkipVersionCheck()) {
		return;
	}

	await runCommand(UpgradeCommand, { flags_internalAutomaticCall: true });
});

const cliMetadata = useCLIMetadata();

export function printCLIVersionAndExitIfFlagUsed(parsed: Awaited<ReturnType<typeof cli.parse>>) {
	if (parsed.v === true || parsed.version === true) {
		console.log(cliMetadata.fullVersionString);
		process.exit(0);
	}
}

export function printHelpAndExitIfFlagUsedOrNoCommandPassed(
	parsed: Awaited<ReturnType<typeof cli.parse>>,
	entrypoint: string,
) {
	if (parsed.help === true || parsed.h === true || parsed._.length === 0) {
		console.log(renderMainHelpMenu(entrypoint));
		process.exit(0);
	}
}

export async function runCLI(entrypoint: string) {
	cliDebugPrint('CLIMetadata', {
		...cliMetadata,
		fullVersionString: cliMetadata.fullVersionString,
		argv: process.argv,
		cwd: process.cwd(),
		execPath: process.execPath,
	});

	await cli.parse(process.argv.slice(2), {}, (rawError, parsed) => {
		if (rawError && parsed._.length > 0) {
			cliDebugPrint('RunCLIError', { type: 'parsed', error: rawError?.message, parsed });

			const errorMessageSplit = rawError.message.split(' ').map((part) => part.trim());

			const possibleCommands = [
				//
				`${parsed._[0]} ${parsed._[1]}`,
				`${parsed._[0]}`,
			];

			const command = commandRegistry.get(possibleCommands.find((cmd) => commandRegistry.has(cmd)) ?? '');

			if (!command) {
				const closestMatches = useCommandSuggestions(String(parsed._[0]));

				let message = chalk.gray(`Command ${chalk.whiteBright(parsed._[0])} not found`);

				if (closestMatches.length) {
					message += '\n  ';
					message += chalk.gray(
						`Did you mean: ${closestMatches.map((cmd) => chalk.whiteBright(cmd)).join(', ')}?`,
					);
				}

				error({ message });

				return;
			}

			const commandFlags = Object.entries(command.flags ?? {})
				.filter(([, flag]) => typeof flag !== 'string')
				.map(([flagName, flag]) => {
					const castedFlag = flag as TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>;

					const flagKey = kebabCaseString(camelCaseToKebabCase(flagName)).toLowerCase();

					return {
						flagKey,
						char: castedFlag.char,
						aliases: castedFlag.aliases?.map((alias) =>
							kebabCaseString(camelCaseToKebabCase(alias)).toLowerCase(),
						),
						matches(otherFlagKey: string) {
							return (
								this.flagKey === otherFlagKey ||
								this.char === otherFlagKey ||
								this.aliases?.some((aliasedFlag) => aliasedFlag === otherFlagKey)
							);
						},
					};
				});

			switch (errorMessageSplit[0]) {
				case 'MISSING_ARGUMENT_INPUT': {
					for (const flag of commandFlags) {
						if (flag.matches(errorMessageSplit[1])) {
							error({
								message: `Flag --${flag.flagKey} expects a value`,
							});

							return;
						}
					}

					break;
				}

				case 'ARGUMENTS_ARE_MUTUALLY_EXCLUSIVE_INPUT': {
					const args = JSON.parse(errorMessageSplit[1]) as string[];

					error({
						message: [
							`The following errors occurred:`,
							...args
								.sort((a, b) => a.localeCompare(b))
								.map((arg) => {
									const value = parsed[arg];

									const isBoolean = typeof value === 'boolean';

									const argRepresentation = isBoolean ? `--${arg}` : `--${arg}=${value}`;

									return `  ${chalk.red('>')}  ${chalk.gray(
										`${argRepresentation} cannot also be provided when using ${args
											.filter((a) => a !== arg)
											.map((a) => `--${a}`)
											.join(', ')}`,
									)}`;
								}),
							`  ${chalk.red('>')}  See more help with --help`,
						].join('\n'),
					});

					break;
				}

				case 'UNKNOWN_ARGUMENT_INPUT':
				case 'UNKNOWN_ARGUMENTS_INPUT': {
					const nonexistentType = (() => {
						if (commandFlags.length) {
							return 'flag';
						}

						if (command.subcommands?.length) {
							return 'subcommand';
						}

						return 'argument';
					})();

					const nonexistentRepresentation = (() => {
						// Rudimentary as heck, we cannot infer if the flag is provided as `-f` or `-ff` or `--flag`, etc.
						if (nonexistentType === 'flag') {
							return errorMessageSplit[1].length === 1
								? `-${errorMessageSplit[1]}`
								: `--${errorMessageSplit[1]}`;
						}

						return errorMessageSplit[1];
					})();

					const closestMatches =
						nonexistentType === 'subcommand'
							? useCommandSuggestions(`${parsed._[0]} ${errorMessageSplit[1]}`)
							: [];

					const messageParts = [
						chalk.gray(`Nonexistent ${nonexistentType}: ${chalk.whiteBright(nonexistentRepresentation)}`),
					];

					if (closestMatches.length) {
						messageParts.push(
							chalk.gray(
								`  Did you mean: ${closestMatches.map((cmd) => chalk.whiteBright(cmd)).join(', ')}?`,
							),
						);
					}

					error({
						message: [
							...messageParts,
							'',
							selectiveRenderHelpForCommand(command, {
								showUsageString: true,
								showSubcommands: true,
							}),
						].join('\n'),
					});

					break;
				}

				// @ts-expect-error Intentional fallthrough
				case 'INVALID_VALUES_INPUT': {
					if (errorMessageSplit[2] === 'INVALID_ARGUMENT_OPTION') {
						const jsonPart = errorMessageSplit.slice(3).join(' ');

						try {
							const json = JSON.parse(jsonPart) as { argument: string; given: string; choices: string[] };

							const type = commandFlags.some((flag) => flag.matches(json.argument)) ? 'flag' : 'argument';

							const representation = type === 'flag' ? `--${json.argument}` : json.argument;

							error({
								message: [
									`Expected ${representation} to have one of the following values: ${json.choices.join(', ')}`,
									`  ${chalk.red('>')}  See more help with --help`,
								].join('\n'),
							});

							break;
						} catch {
							cliDebugPrint('RunCLIError', {
								type: 'parse_error_invalid_choices',
								error: rawError.message,
								parsed,
								jsonPart,
							});

							// fallthrough
						}
					}

					// fallthrough
				}

				default: {
					cliDebugPrint('RunCLIError', { type: 'unhandled', error: rawError.message, parsed });

					console.error(
						[
							'The CLI encountered an unhandled argument parsing error!',
							`Please report this issue at https://github.com/apify/apify-cli/issues, and provide the following information:`,
							'',
							`- Stack:\n${rawError.stack}`,
							'',
							'- Arguments (!!!only provide these as is if there is no sensitive information!!!):',
							`  ${JSON.stringify(process.argv.slice(2))}`,
							'',
							`- CLI version: \`${cliMetadata.fullVersionString}\``,
							`- CLI debug logs (process.env.APIFY_CLI_DEBUG): ${process.env.APIFY_CLI_DEBUG ? 'Enabled' : 'Disabled'}`,
							`- Stdin data? ${cachedStdinInput ? 'Yes' : 'No'}`,
						].join('\n'),
					);

					process.exit(1);
				}
			}
		} else {
			handleParseResults(parsed, entrypoint);
		}
	});
}

export function handleParseResults(parsed: Awaited<ReturnType<typeof cli.parse>>, entrypoint: string) {
	if (parsed._.length === 0) {
		printCLIVersionAndExitIfFlagUsed(parsed);
		printHelpAndExitIfFlagUsedOrNoCommandPassed(parsed, entrypoint);
	}

	// console.log({ unhandledArgs: parsed });
}
