import chalk from 'chalk';
import indent from 'indent-string';
import width from 'string-width';
import stripAnsi from 'strip-ansi';
import widestLine from 'widest-line';
import wrap from 'wrap-ansi';

import type { ArgTag, TaggedArgBuilder } from '../args.js';
import type { FlagTag, TaggedFlagBuilder } from '../flags.js';
import { BaseCommandRenderer, type SelectiveRenderOptions } from './_BaseCommandRenderer.js';
import { getMaxLineWidth } from './consts.js';

/*
Executes Actor remotely using your authenticated account.

USAGE
  $ apify call [ACTORID] -o [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file <value>] [-s]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the command runs the remote Actor specified in the '.actor/actor.json' file.

FLAGS
  -b, --build=<value>       Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be given to the Actor.
  -m, --memory=<value>      Amount of memory allocated for the Actor run, in megabytes.
  -o, --output-dataset      (required) Prints out the entire default dataset on successful run of the Actor.
  -s, --silent              Prevents printing the logs of the Actor run to the console.
  -t, --timeout=<value>     Timeout for the Actor run in seconds. Zero value means there is no timeout.
      --input-file=<value>  Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.

DESCRIPTION
  Blah blah blah

GLOBAL FLAGS
  --json  Format output as json.

USAGE
  $ apify login [-t <value>] [-m console|manual]

FLAGS
  -m, --method=<option>  [Optional] Method of logging in to Apify
                         <options: console|manual>
  -t, --token=<value>    [Optional] Apify API token

 */

export class CommandHelp extends BaseCommandRenderer {
	public render(): string {
		const result: string[] = [];

		this.pushShortDescription(result);

		this.pushUsageString(result);

		if (this.command.description) {
			this.pushDescription(result);
		}

		return result.join('\n').trim();
	}

	public selectiveRender(options: SelectiveRenderOptions): string {
		const result: string[] = [];

		if (options.showShortDescription) {
			this.pushShortDescription(result);
		}

		if (options.showUsageString) {
			this.pushUsageString(result);
		}

		if (options.showDescription && this.command.description) {
			this.pushDescription(result);
		}

		return result.join('\n').trim();
	}

	protected pushUsageString(result: string[]) {
		result.push(chalk.bold('USAGE'));

		const baseString = `$ ${this.entrypoint} ${this.command.name}`;
		const indentLevel = 2 + width(baseString);

		const finalString = [baseString];

		const args = Object.entries(this.command.args ?? {}) as [string, TaggedArgBuilder<ArgTag, unknown>][];

		if (args.length) {
			for (const [argName, arg] of args) {
				if (typeof arg === 'string') {
					throw new RangeError('This is a type-check only value, do not actually use it');
				}

				this.pushNewLineBeforeNewEntryIfLengthIsPastTheLimit({
					state: finalString,
					itemToAdd: arg.required ? `<${argName}>` : `[${argName}]`,
					indentSize: indentLevel,
				});
			}
		}

		const flags = Object.entries(this.command.flags ?? {}).filter(([, flag]) => {
			if (typeof flag === 'string') {
				throw new RangeError('This is a type-check only value, do not actually use it');
			}

			return !flag.hidden;
		});

		if (this.command.enableJsonFlag) {
			flags.push([
				'json',
				{
					choices: null,
					flagTag: 'boolean',
					hasDefault: false,
					required: false,
					stdin: null as never,
					builder: null as never,
					aliases: undefined,
					char: undefined,
					description: 'Format the command output as JSON',
					hidden: undefined,
					exclusive: undefined,
				},
			]);
		}

		const sortedFlags = new Map(
			flags.sort((a, b) => {
				if (typeof a[1] === 'string') {
					throw new RangeError('This is a type-check only value, do not actually use it');
				}

				if (typeof b[1] === 'string') {
					throw new RangeError('This is a type-check only value, do not actually use it');
				}

				if (a[1].required && !b[1].required) {
					return -1;
				}

				if (!a[1].required && b[1].required) {
					return 1;
				}

				return a[0].localeCompare(b[0]);
			}) as [string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>][],
		);

		const flagsToIgnore = new Set<string>();

		if (flags.length) {
			for (const [flagName, flag] of sortedFlags) {
				if (typeof flag === 'string') {
					throw new RangeError('This is a type-check only value, do not actually use it');
				}

				if (flagsToIgnore.has(flagName)) {
					continue;
				}

				let requiredState = flag.required;
				const flagString = this.makeFlagString(flagName, flag);

				const flagParts: string[] = [flagString];

				if (flag.exclusive?.length) {
					for (const exclusiveFlagName of flag.exclusive) {
						flagsToIgnore.add(exclusiveFlagName);

						const exclusiveFlag = sortedFlags.get(exclusiveFlagName)!;

						const exclusiveFlagString = this.makeFlagString(exclusiveFlagName, exclusiveFlag);

						flagParts.push(exclusiveFlagString);

						if (exclusiveFlag.required) {
							requiredState = true;
						}
					}
				}

				this.pushNewLineBeforeNewEntryIfLengthIsPastTheLimit({
					state: finalString,
					itemToAdd: requiredState ? flagParts.join(' | ') : `[${flagParts.join(' | ')}]`,
					indentSize: indentLevel,
				});
			}
		}

		const wrapped = wrap(finalString.join(' '), getMaxLineWidth() - indentLevel);

		// + 1 here is to align everything properly
		const indented = indent(wrapped, indentLevel + 1).trim();

		result.push(`  ${indented}`, '');

		if (args.length) {
			this.pushArguments(result, args);
		}

		if (flags.length) {
			this.pushFlags(result, sortedFlags);
		}
	}

	protected pushArguments(result: string[], args: [string, TaggedArgBuilder<ArgTag, unknown>][]) {
		if (!args.length) {
			return;
		}

		result.push(chalk.bold('ARGUMENTS'));

		const widestArgNameLength = widestLine(args.map(([argName]) => argName).join('\n'));

		for (const [argName, arg] of args) {
			const fullString = `${argName.padEnd(widestArgNameLength)}  ${arg.description}`;

			// -2 for the space between the name and the description
			const wrapped = wrap(fullString, getMaxLineWidth() - widestArgNameLength - 2);

			// +2 for the space between the name and the description
			// +2 for the indent
			const indented = indent(wrapped, widestArgNameLength + 2 + 2).trim();

			result.push(`  ${indented}`);
		}

		result.push('');
	}

	protected pushFlags(
		result: string[],
		flags: Map<string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>>,
	) {
		if (!flags.size) {
			return;
		}

		result.push(chalk.bold('FLAGS'));

		const linesOfFlags = new Map<string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>>();

		for (const [flagName, flag] of flags) {
			const stringParts: string[] = [];

			if (flag.char) {
				stringParts.push(`-${flag.char},`);
			} else {
				stringParts.push(' '.repeat(3));
			}

			switch (flag.flagTag) {
				case 'boolean':
					stringParts.push(`--${this.kebabFlagName(flagName)}`);
					break;
				case 'string':
				case 'integer': {
					const flagValues = flag.choices ? '<option>' : '<value>';

					stringParts.push(`--${this.kebabFlagName(flagName)}=${chalk.underline(flagValues)}`);
					break;
				}
				default:
					throw new Error(`Unhandled flag tag: ${flag.flagTag}`);
			}

			linesOfFlags.set(stringParts.join(' '), flag);
		}

		const widestFlagNameLength = widestLine([...linesOfFlags.keys()].map(stripAnsi).join('\n'));

		for (const [flagString, flag] of linesOfFlags) {
			const paddingToAdd = widestFlagNameLength - stripAnsi(flagString).length;
			let fullString = `${flagString}${' '.repeat(paddingToAdd)}  ${flag.description ?? ''}`;

			if (flag.choices?.length) {
				fullString += `\n<options: ${flag.choices.join('|')}>`;
			}

			const wrapped = wrap(fullString, getMaxLineWidth() - widestFlagNameLength);

			const indented = indent(wrapped, widestFlagNameLength)
				.trim()
				.split('\n')
				.map((line) => {
					// For lines that don't start with a short flag, add 4 spaces to indent them further, and align with the flags that also have a short form
					if (!/^-[a-z]/.test(line.trim())) {
						return `    ${line}`;
					}

					return line;
				})
				.join('\n');

			result.push(`  ${indented}`);
		}

		result.push('');
	}
}
