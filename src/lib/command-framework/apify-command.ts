/* eslint-disable max-classes-per-file */

import type { parseArgs,ParseArgsConfig, ParseArgsOptionDescriptor } from 'node:util';

import type { Awaitable } from '@crawlee/types';
import chalk from 'chalk';
import indentString from 'indent-string';
import widestLine from 'widest-line';
import wrapAnsi from 'wrap-ansi';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { error } from '../outputs.js';
import type { ArgTag, TaggedArgBuilder } from './args.js';
import { CommandError, CommandErrorCode } from './CommandError.js';
import type { FlagTag, TaggedFlagBuilder } from './flags.js';
import { registerCommandForHelpGeneration, renderHelpForCommand, selectiveRenderHelpForCommand } from './help.js';
import { getMaxLineWidth } from './help/consts.js';

export enum StdinMode {
	Raw = 1,
	Stringified = 2,
}

interface ArgTagToTSType {
	string: string;
}

interface FlagTagToTSType {
	string: string;
	boolean: boolean;
	integer: number;
}

type InferArgTypeFromArg<Builder extends TaggedArgBuilder<ArgTag, unknown>> = Builder extends TaggedArgBuilder<
	infer ReturnedType,
	infer Required
>
	? If<Required, ArgTagToTSType[ReturnedType], ArgTagToTSType[ReturnedType] | undefined>
	: unknown;

type If<T, Y, N> = T extends true ? Y : N;
type IfNotUnknown<T, Y, N> = T extends unknown ? Y : N;

type InferFlagTypeFromFlag<
	Builder extends TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>,
	OptionalIfHasDefault = false,
> = Builder extends TaggedFlagBuilder<infer ReturnedType, never, infer Required, infer HasDefault> // Handle special case where there can be no choices
	? If<
			// If we want to mark flags as optional if they have a default
			OptionalIfHasDefault,
			// If the flag actually has a default value, assert on that
			IfNotUnknown<
				HasDefault,
				FlagTagToTSType[ReturnedType] | undefined,
				// Otherwise fall back to required status
				If<Required, FlagTagToTSType[ReturnedType], FlagTagToTSType[ReturnedType] | undefined>
			>,
			// fallback to required status
			If<Required, FlagTagToTSType[ReturnedType], FlagTagToTSType[ReturnedType] | undefined>
		>
	: // Might have choices, in which case we branch based on that
		Builder extends TaggedFlagBuilder<infer ReturnedType, infer ChoiceType, infer Required, infer HasDefault>
		? // If choices is a valid array
			ChoiceType extends unknown[] | readonly unknown[]
			? // If we want optional flags to stay as optional
				If<
					OptionalIfHasDefault,
					ChoiceType[number] | undefined,
					// fallback to required status
					If<Required, ChoiceType[number], ChoiceType[number] | undefined>
				>
			: If<
					// If we want to mark flags as optional if they have a default
					OptionalIfHasDefault,
					// If the flag actually has a default value, assert on that
					IfNotUnknown<
						HasDefault,
						FlagTagToTSType[ReturnedType] | undefined,
						// Fallback to required status
						If<Required, FlagTagToTSType[ReturnedType], FlagTagToTSType[ReturnedType] | undefined>
					>,
					// fallback to required status
					If<Required, FlagTagToTSType[ReturnedType], FlagTagToTSType[ReturnedType] | undefined>
				>
		: unknown;

// Adapted from https://gist.github.com/kuroski/9a7ae8e5e5c9e22985364d1ddbf3389d to support kebab-case and "string a"
type CamelCase<S extends string> = S extends
	| `${infer P1}-${infer P2}${infer P3}`
	| `${infer P1}_${infer P2}${infer P3}`
	| `${infer P1} ${infer P2}${infer P3}`
	? `${P1}${Uppercase<P2>}${CamelCase<P3>}`
	: S;

type _InferArgsFromCommand<O extends Record<string, TaggedArgBuilder<ArgTag, unknown>>> = {
	[K in keyof O as CamelCase<string & K>]: InferArgTypeFromArg<O[K]>;
};

type _InferFlagsFromCommand<
	O extends Record<string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>>,
	OptionalIfHasDefault = false,
> = {
	[K in keyof O as CamelCase<string & K>]: InferFlagTypeFromFlag<O[K], OptionalIfHasDefault>;
};

type InferArgsFromCommand<O extends Record<string, TaggedArgBuilder<ArgTag, unknown>> | undefined> = O extends undefined
	? Record<string, unknown>
	: _InferArgsFromCommand<Exclude<O, undefined>>;

type InferFlagsFromCommand<
	O extends Record<string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>> | undefined,
	OptionalIfHasDefault = false,
> = (O extends undefined
	? Record<string, unknown>
	: _InferFlagsFromCommand<Exclude<O, undefined>, OptionalIfHasDefault>) & {
	json: boolean;
};

export function camelCaseString(str: string): string {
	return str.replace(/[-_\s](.)/g, (_, group1) => group1.toUpperCase());
}

export function kebabCaseString(str: string): string {
	return str.replace(/[\s_]+/g, '-');
}

export function camelCaseToKebabCase(str: string): string {
	return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

const helpFlagDefinition = {
	type: 'boolean',
	multiple: false,
	short: 'h',
} as const satisfies ParseArgsOptionDescriptor;

const jsonFlagDefinition = {
	type: 'boolean',
	multiple: false,
} as const satisfies ParseArgsOptionDescriptor;

export const commandRegistry = new Map<string, typeof BuiltApifyCommand>();

type ParseResult = ReturnType<typeof parseArgs<ReturnType<ApifyCommand['_buildParseArgsOption']>>>;

export abstract class ApifyCommand<T extends typeof BuiltApifyCommand = typeof BuiltApifyCommand> {
	static args?: Record<string, TaggedArgBuilder<ArgTag, unknown>> & {
		json?: 'Do not use json as the key of an argument, as it will prevent the --json flag from working';
	};

	static flags?: Record<string, TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>> & {
		json?: 'Do not use json as the key of a flag, override the enableJsonFlag static property instead';
	};

	static subcommands?: (typeof BuiltApifyCommand)[];

	static enableJsonFlag = false;

	static name: string;

	static shortDescription?: string;

	static description?: string;

	static aliases?: string[];

	static hidden?: boolean;

	static hiddenAliases?: string[];

	protected telemetryData: Record<string, unknown> = {};

	protected flags!: InferFlagsFromCommand<T['flags']>;

	protected args!: InferArgsFromCommand<T['args']>;

	protected entrypoint: string;

	public constructor(entrypoint: string) {
		this.entrypoint = entrypoint;
	}

	abstract run(): Awaitable<void>;

	protected get ctor(): typeof BuiltApifyCommand {
		return this.constructor as typeof BuiltApifyCommand;
	}

	protected pluralString(amount: number, singular: string, plural: string): string {
		return amount === 1 ? singular : plural;
	}

	static printHelp(): never {
		console.log(renderHelpForCommand(this as typeof BuiltApifyCommand));

		process.exit(0);
	}

	protected printHelp() {
		return this.ctor.printHelp();
	}

	private async _run(parseResult: ParseResult) {
		const { values: rawFlags, positionals: rawArgs } = parseResult;

		if (rawFlags.help) {
			this.ctor.printHelp();
		}

		// Cheating a bit here with the types, but its fine

		this.args = {} as any;
		this.flags = {} as any;

		// If we have this set, we assume that the user wants only the flag
		if (this.ctor.enableJsonFlag) {
			if (typeof rawFlags.json === 'boolean') {
				this.flags.json = rawFlags.json;
			} else {
				this.flags.json = false;
			}
		}

		const missingRequiredArgs = new Map<string, TaggedArgBuilder<ArgTag, unknown>>();

		if (this.ctor.args) {
			let index = 0;
			for (const [userArgName, builderData] of Object.entries(this.ctor.args)) {
				if (typeof builderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				const camelCasedName = camelCaseString(userArgName);

				const rawArg = rawArgs[index++];

				if (rawArg) {
					switch (builderData.argTag) {
						case 'string':
						default:
							this.args[camelCasedName] = String(rawArg);

							if (rawArg === '-' && builderData.stdin) {
								this.args[camelCasedName] = this._handleStdin(builderData.stdin);
							}

							if (builderData.catchAll) {
								this.args[camelCasedName] = rawArgs.slice(index).join(' ');
							}

							break;
					}
				} else if (builderData.required) {
					missingRequiredArgs.set(userArgName, builderData);
				}
			}
		}

		if (missingRequiredArgs.size) {
			this._printMissingRequiredArgs(missingRequiredArgs);
			return;
		}

		this._parseFlags(rawFlags);

		try {
			await this.run();
		} catch (err: any) {
			error({ message: err.message });
		} finally {
			// analytics
			/*
			eventData.installationType = detectInstallationType();

			if (!this.telemetryData.actorLanguage && command && COMMANDS_WITHIN_ACTOR.includes(command)) {
				const cwdProject = await useCwdProject();

				cwdProject.inspect((project) => {
					if (project.type === ProjectLanguage.JavaScript) {
						eventData.actorLanguage = LANGUAGE.NODEJS;
						eventData.actorNodejsVersion = project.runtime!.version;
					} else if (project.type === ProjectLanguage.Python || project.type === ProjectLanguage.Scrapy) {
						eventData.actorLanguage = LANGUAGE.PYTHON;
						eventData.actorPythonVersion = project.runtime!.version;
					}
				});
			}

			await maybeTrackTelemetry({
				eventName: `cli_command_${command}`,
				eventData,
			});
			*/
		}
	}

	private _userFlagNameToRegisteredName(
		userFlagName: string,
		builderData: TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>,
	) {
		const rawBaseFlagName = kebabCaseString(camelCaseToKebabCase(userFlagName)).toLowerCase();

		let baseFlagName = rawBaseFlagName;

		if (rawBaseFlagName.startsWith('no-')) {
			baseFlagName = rawBaseFlagName.slice(3);
		}

		const allMatchers = new Set<string>();

		for (const alias of builderData.aliases ?? []) {
			allMatchers.add(kebabCaseString(camelCaseToKebabCase(alias)).toLowerCase());
		}

		return { baseFlagName, rawBaseFlagName, allMatchers: [baseFlagName, ...allMatchers] };
	}

	private _parseFlags(rawFlags: ParseResult['values']) {
		if (!this.ctor.flags) {
			return;
		}

		for (const [userFlagName, builderData] of Object.entries(this.ctor.flags)) {
			if (typeof builderData === 'string') {
				throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
			}

			const { allMatchers, baseFlagName, rawBaseFlagName } = this._userFlagNameToRegisteredName(
				userFlagName,
				builderData,
			);

			const camelCasedName = camelCaseString(baseFlagName);

			// If you have a flag a, with alias b, and you pass --a and --b, it's not allowed
			const matchingFlags = allMatchers.filter((matcher) => rawFlags[matcher]);

			if (matchingFlags.length > 1) {
				throw new CommandError({
					code: CommandErrorCode.APIFY_FLAG_PROVIDED_MULTIPLE_TIMES,
					metadata: {
						flag: baseFlagName,
					},
				});
			}

			let rawFlag = rawFlags[matchingFlags[0]];

			if (!rawFlag && builderData.required) {
				throw new CommandError({
					code: CommandErrorCode.APIFY_MISSING_FLAG,
					metadata: {
						flag: baseFlagName,
						matcher: matchingFlags[0],
					},
				});
			}

			// If you provide --a 1 --a 2, it's <currently> not allowed
			if (Array.isArray(rawFlag)) {
				if (rawFlag.length > 1) {
					throw new CommandError({
						code: CommandErrorCode.APIFY_FLAG_PROVIDED_MULTIPLE_TIMES,
						metadata: {
							flag: baseFlagName,
						},
					});
				}

				rawFlag = rawFlag[0]! as string | boolean;
			}

			if (typeof rawFlag !== 'undefined') {
				switch (builderData.flagTag) {
					case 'boolean': {
						this.flags[camelCasedName] = rawBaseFlagName.startsWith('no-') ? !rawFlag : rawFlag;

						break;
					}
					case 'integer': {
						const parsed = Number(rawFlag);

						if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
							throw new CommandError({
								code: CommandErrorCode.APIFY_INVALID_FLAG_INTEGER_VALUE,
								metadata: {
									flag: baseFlagName,
									value: String(rawFlag),
								},
							});
						}

						this.flags[camelCasedName] = parsed;

						break;
					}
					case 'string':
					default: {
						this.flags[camelCasedName] = rawFlag;

						if (rawFlag === '-' && builderData.stdin) {
							this.flags[camelCasedName] = this._handleStdin(builderData.stdin);
						}

						break;
					}
				}
			} else if (typeof builderData.hasDefault !== 'undefined') {
				this.flags[camelCasedName] = builderData.hasDefault;
			}

			// Validate choices
			if (
				// We have the flag
				this.flags[camelCasedName] &&
				// And we have a list of choices
				builderData.choices &&
				// And the flag is not one of the choices
				!builderData.choices.includes(this.flags[camelCasedName] as string)
			) {
				throw new CommandError({
					code: CommandErrorCode.APIFY_INVALID_CHOICE,
					metadata: {
						flag: baseFlagName,
						choices: builderData.choices.map((choice) => chalk.white.bold(choice)).join(', '),
					},
				});
			}

			// Re-validate required (we don't have the flag and it's either required or passed in)
			if (!this.flags[camelCasedName] && (builderData.required || rawFlag)) {
				throw new CommandError({
					code: CommandErrorCode.APIFY_MISSING_FLAG,
					metadata: {
						flag: baseFlagName,
						matcher: matchingFlags[0],
						providedButReceivedNoValue: !!rawFlag,
					},
				});
			}
		}
	}

	private _printMissingRequiredArgs(missingRequiredArgs: Map<string, TaggedArgBuilder<ArgTag, unknown>>) {
		const help = selectiveRenderHelpForCommand(this.ctor, {
			showUsageString: true,
		});

		const widestArgNameLength = widestLine([...missingRequiredArgs.keys()].join('\n'));

		const missingArgsStrings: string[] = [];

		for (const [argName, arg] of missingRequiredArgs) {
			const fullString = `${argName.padEnd(widestArgNameLength)}  ${arg.description}`;

			const wrapped = wrapAnsi(fullString, getMaxLineWidth() - widestArgNameLength - 2);

			const indented = indentString(wrapped, widestArgNameLength + 2 + 2).trim();

			missingArgsStrings.push(`  ${chalk.red('>')}  ${indented}`);
		}

		error({
			message: [
				`Missing ${missingRequiredArgs.size} required ${this.pluralString(missingRequiredArgs.size, 'argument', 'arguments')}:`,
				...missingArgsStrings,
				chalk.gray('  See more help with --help'),
				'',
				help,
			].join('\n'),
		});
	}

	private _handleStdin(mode: StdinMode) {
		switch (mode) {
			case StdinMode.Stringified:
				return cachedStdinInput?.toString('utf8') ?? '';
			default:
				return cachedStdinInput;
		}
	}

	protected _buildParseArgsOption() {
		const object = {
			allowNegative: true,
			allowPositionals: true,
			strict: true,
			options: {
				help: helpFlagDefinition,
			} as {
				help: typeof helpFlagDefinition;
				json: typeof jsonFlagDefinition;
				[k: string]: ParseArgsOptionDescriptor;
			},
		} satisfies ParseArgsConfig;

		if (this.ctor.flags) {
			for (const [key, internalBuilderData] of Object.entries(this.ctor.flags)) {
				if (typeof internalBuilderData === 'string') {
					throw new RangeError('Do not provide the string for the json flag! It is a type level assertion!');
				}
				// Skip the "json" flag, as it is set by enableJsonFlag
				if (key.toLowerCase() === 'json') {
					continue;
				}

				let flagKey = kebabCaseString(camelCaseToKebabCase(key)).toLowerCase();

				// node handles `no-` flags by negating the flag, so we need to handle that differently if we register a flag with a "no-" prefix
				if (flagKey.startsWith('no-')) {
					flagKey = flagKey.slice(3);
				}

				const flagDefinitions = internalBuilderData.builder(flagKey);

				for (const { flagName, option } of flagDefinitions) {
					object.options![flagName] = option;
				}
			}
		}

		if (this.ctor.enableJsonFlag) {
			object.options!.json = jsonFlagDefinition;
		}

		return object;
	}

	static registerCommand(entrypoint: string) {
		registerCommandForHelpGeneration(entrypoint, this as typeof BuiltApifyCommand);

		// Register the command itself
		commandRegistry.set(this.name, this as typeof BuiltApifyCommand);

		// Register all aliases
		if (this.aliases?.length) {
			for (const alias of this.aliases) {
				commandRegistry.set(alias, this as typeof BuiltApifyCommand);
			}
		}

		if (this.hiddenAliases?.length) {
			for (const alias of this.hiddenAliases) {
				commandRegistry.set(alias, this as typeof BuiltApifyCommand);
			}
		}

		// For each subcommand, register it and all its aliases
		if (this.subcommands?.length) {
			for (const subcommand of this.subcommands) {
				// Base name + subcommand name
				commandRegistry.set(`${this.name} ${subcommand.name}`, subcommand as typeof BuiltApifyCommand);

				// All aliases of the base command + subcommand name
				if (this.aliases?.length) {
					for (const alias of this.aliases) {
						commandRegistry.set(`${alias} ${subcommand.name}`, subcommand as typeof BuiltApifyCommand);
					}
				}

				// All hidden aliases of the base command + subcommand name
				if (this.hiddenAliases?.length) {
					for (const alias of this.hiddenAliases) {
						commandRegistry.set(`${alias} ${subcommand.name}`, subcommand as typeof BuiltApifyCommand);
					}
				}

				// For each subcommand, register all its aliases
				if (subcommand.aliases?.length) {
					for (const subcommandAlias of subcommand.aliases) {
						// Base name + subcommand alias
						commandRegistry.set(`${this.name} ${subcommandAlias}`, subcommand as typeof BuiltApifyCommand);

						// All aliases of the base command + subcommand alias
						if (this.aliases?.length) {
							for (const alias of this.aliases) {
								commandRegistry.set(
									`${alias} ${subcommandAlias}`,
									subcommand as typeof BuiltApifyCommand,
								);
							}
						}

						// All hidden aliases of the base command + subcommand alias
						if (this.hiddenAliases?.length) {
							for (const alias of this.hiddenAliases) {
								commandRegistry.set(
									`${alias} ${subcommandAlias}`,
									subcommand as typeof BuiltApifyCommand,
								);
							}
						}
					}
				}

				// For each subcommand, register all its hidden aliases
				if (subcommand.hiddenAliases?.length) {
					for (const subcommandAlias of subcommand.hiddenAliases) {
						// Base name + subcommand hidden alias
						commandRegistry.set(`${this.name} ${subcommandAlias}`, subcommand as typeof BuiltApifyCommand);

						// All aliases of the base command + subcommand hidden alias
						if (this.aliases?.length) {
							for (const alias of this.aliases) {
								commandRegistry.set(
									`${alias} ${subcommandAlias}`,
									subcommand as typeof BuiltApifyCommand,
								);
							}
						}

						// All hidden aliases of the base command + subcommand hidden alias
						if (this.hiddenAliases?.length) {
							for (const alias of this.hiddenAliases) {
								commandRegistry.set(
									`${alias} ${subcommandAlias}`,
									subcommand as typeof BuiltApifyCommand,
								);
							}
						}
					}
				}
			}
		}
	}
}

// Utility type to extract only the keys that are optional
type ExtractOptionalFlagKeys<Cmd extends typeof BuiltApifyCommand> = {
	[K in keyof InferFlagsFromCommand<Cmd['flags'], true>]: [undefined] extends [
		InferFlagsFromCommand<Cmd['flags'], true>[K],
	]
		? K
		: never;
}[keyof InferFlagsFromCommand<Cmd['flags'], true>];

type ExtractOptionalArgKeys<Cmd extends typeof BuiltApifyCommand> = {
	[K in keyof InferArgsFromCommand<Cmd['args']>]: [undefined] extends [InferArgsFromCommand<Cmd['args']>[K]]
		? K
		: never;
}[keyof InferArgsFromCommand<Cmd['args']>];

// Messy type...
type StaticArgsFlagsInput<Cmd extends typeof BuiltApifyCommand> = Omit<
	{
		// This ensures we only get the required args
		[K in Exclude<
			keyof InferArgsFromCommand<Cmd['args']>,
			ExtractOptionalArgKeys<Cmd>
		> as `args_${string & K}`]: InferArgsFromCommand<Cmd['args']>[K];
	},
	// Omit args_json as it is used only to throw an error if the user provides it
	'args_json'
> &
	Omit<
		{
			// Fill in the rest of the args, this will not override what the code above does
			[K in keyof InferArgsFromCommand<Cmd['args']> as `args_${string & K}`]?: InferArgsFromCommand<
				Cmd['args']
			>[K];
		},
		'args_json'
	> &
	Omit<
		{
			// This ensures we only ever get the required flags into this object, as `key?: type` and `key: type | undefined` are not the same (one is optionally present, the other is mandatory)
			[K in Exclude<
				keyof InferFlagsFromCommand<Cmd['flags'], true>,
				ExtractOptionalFlagKeys<Cmd>
			> as `flags_${string & K}`]: InferFlagsFromCommand<Cmd['flags'], true>[K];
		},
		// Omit flags_json as it is used only to throw an error if the user provides it
		'flags_json'
	> &
	Omit<
		{
			// Fill in the rest of the flags, this will not override what the code above does
			[K in keyof InferFlagsFromCommand<Cmd['flags'], true> as `flags_${string & K}`]?: InferFlagsFromCommand<
				Cmd['flags'],
				true
			>[K];
		},
		// Omit flags_json as it is used only to throw an error if the user provides it
		'flags_json'
	> & {
		// Define it at the end exactly like it is
		flags_json?: boolean;
	};

export async function testRunCommand<Cmd extends typeof BuiltApifyCommand>(
	command: Cmd,
	argsFlags: StaticArgsFlagsInput<Cmd>,
) {
	return internalRunCommand('test-cli', command, argsFlags);
}

export async function internalRunCommand<Cmd extends typeof BuiltApifyCommand>(
	entrypoint: string,
	command: Cmd,
	argsFlags: StaticArgsFlagsInput<Cmd>,
) {
	// This is very much yolo'd in, but its purpose is for testing only
	const rawObject: ParseResult = {
		positionals: [],
		values: {},
	};

	let positionalIndex = 0;

	for (const [key, value] of Object.entries(argsFlags)) {
		const [type, rawKey] = key.split('_');

		if (type === 'args') {
			rawObject.positionals[positionalIndex++] = value as unknown as string;
		} else {
			const yargsFlagName = kebabCaseString(camelCaseToKebabCase(rawKey)).toLowerCase();

			// We handle "no-" flags differently, as yargs handles them by negating the base flag name (no-prompt -> prompt=false)
			if (yargsFlagName.startsWith('no-')) {
				rawObject.values[yargsFlagName.slice(3)] = !value;
			} else {
				rawObject.values[yargsFlagName] = value;
			}
		}
	}

	const instance = new (command as typeof BuiltApifyCommand)(entrypoint);

	// eslint-disable-next-line dot-notation
	await instance['_run'](rawObject);
}

export declare class BuiltApifyCommand extends ApifyCommand {
	override run(): Awaitable<void>;
}
