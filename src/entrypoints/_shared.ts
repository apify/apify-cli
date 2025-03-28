import process from 'node:process';

import chalk from 'chalk';
import yargonaut from 'yargonaut';
import yargs from 'yargs/yargs';

import { camelCaseToKebabCase, commandRegistry, kebabCaseString } from '../lib/command-framework/apify-command.js';
import type { FlagTag, TaggedFlagBuilder } from '../lib/command-framework/flags.js';
import { renderMainHelpMenu, selectiveRenderHelpForCommand } from '../lib/command-framework/help.js';
import { readStdin } from '../lib/commands/read-stdin.js';
import { cliVersion } from '../lib/consts.js';
import { error } from '../lib/outputs.js';

yargonaut //
	.style('blue')
	.style('yellow', 'required')
	.helpStyle('green')
	.errorsStyle('red');

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
	})
	.option('help', {
		boolean: true,
		describe: 'Shows this help message.',
		alias: 'h',
	});

// @ts-expect-error @types/yargs is outdated -.-
cli.usageConfiguration({ 'hide-types': true });

export function printCLIVersionAndExitIfFlagUsed(parsed: Awaited<ReturnType<typeof cli.parse>>) {
	if (parsed.v === true || parsed.version === true) {
		console.log(cliVersion);
		process.exit(0);
	}
}

export function printHelpAndExitIfFlagUsed(parsed: Awaited<ReturnType<typeof cli.parse>>, entrypoint: string) {
	if (parsed.help === true || parsed.h === true || parsed._.length === 0) {
		console.log(renderMainHelpMenu(entrypoint));
		process.exit(0);
	}
}

export async function runCLI(entrypoint: string) {
	await cli.parse(process.argv.slice(2), {}, (rawError, parsed) => {
		if (rawError) {
			if (process.env.CLI_DEBUG) {
				console.error({ type: 'parsed', error: rawError?.message, parsed });
			}

			const errorMessageSplit = rawError.message.split(' ');

			const possibleCommands = [
				//
				`${parsed._[0]} ${parsed._[1]}`,
				`${parsed._[0]}`,
			];

			const command = commandRegistry.get(possibleCommands.find((cmd) => commandRegistry.has(cmd)) ?? '');

			if (!command) {
				error({
					message: `Command ${parsed._[0]} not found`,
				});

				return;
			}

			const commandFlags = Object.entries(command.flags ?? {})
				.filter(([, flag]) => typeof flag !== 'string')
				.map(([flagName, flag]) => {
					const castedFlag = flag as TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>;

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
					const nonexistentType = commandFlags.length ? 'flag' : 'subcommand';
					const nonexistentRepresentation = (() => {
						// Rudimentary as heck, we cannot infer if the flag is provided as `-f` or `-ff` or `--flag`, etc.
						if (nonexistentType === 'flag') {
							return errorMessageSplit[1].length === 1
								? `-${errorMessageSplit[1]}`
								: `--${errorMessageSplit[1]}`;
						}

						return errorMessageSplit[1];
					})();

					error({
						message: [
							`Nonexistent ${nonexistentType}: ${nonexistentRepresentation}`,
							`  ${chalk.red('>')}  See more help with --help`,
							'',
							selectiveRenderHelpForCommand(command, {
								showUsageString: true,
								showSubcommands: true,
							}),
						].join('\n'),
					});

					break;
				}

				default: {
					console.error({ type: 'unhandled', error: rawError.message, parsed });
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
		printHelpAndExitIfFlagUsed(parsed, entrypoint);
	}

	// console.log({ unhandledArgs: parsed });
}

export const cachedStdinInput = await readStdin();
