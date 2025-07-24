/* eslint-disable max-classes-per-file */

import type { Awaitable } from '@crawlee/types';
import chalk from 'chalk';
import indentString from 'indent-string';
import widestLine from 'widest-line';
import wrapAnsi from 'wrap-ansi';
import type { ArgumentsCamelCase, Argv, CommandBuilder, CommandModule } from 'yargs';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { error } from '../outputs.js';
import type { ArgTag, TaggedArgBuilder } from './args.js';
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

export const commandRegistry = new Map<string, typeof BuiltApifyCommand>();

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

	protected printHelp(): never {
		console.log(renderHelpForCommand(this.ctor));

		process.exit(0);
	}

	private async _run(rawArgs: ArgumentsCamelCase) {
		if (rawArgs.help) {
			this.printHelp();
		}

		// Cheating a bit here with the types, but its fine

		this.args = {} as any;

		this.flags = {} as any;

		// If we have this set, we assume that the user wants only the flag
		if (this.ctor.enableJsonFlag) {
			if (typeof rawArgs.json === 'boolean') {
				this.flags.json = rawArgs.json;
			} else {
				// Idk exactly if this is achievable but 🤷
				this.flags.json = false;
			}
		}

		const missingRequiredArgs = new Map<string, TaggedArgBuilder<ArgTag, unknown>>();

		if (this.ctor.args) {
			for (const [userArgName, builderData] of Object.entries(this.ctor.args)) {
				if (typeof builderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				const yargsArgName = userArgName.replaceAll(' ', '');
				const camelCasedName = camelCaseString(userArgName);

				if (rawArgs[yargsArgName]) {
					switch (builderData.argTag) {
						case 'string':
						default:
							this.args[camelCasedName] = String(rawArgs[yargsArgName]);

							if (rawArgs[yargsArgName] === '-' && builderData.stdin) {
								this.args[camelCasedName] = this._handleStdin(builderData.stdin);
							}

							if (builderData.catchAll) {
								this.args[camelCasedName] = (this.args[camelCasedName] as string).split(',').join(' ');
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

		if (this.ctor.flags) {
			for (const [userFlagName, builderData] of Object.entries(this.ctor.flags)) {
				if (typeof builderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				const rawYargsFlagName = kebabCaseString(camelCaseToKebabCase(userFlagName)).toLowerCase();
				const camelCasedName = camelCaseString(rawYargsFlagName);

				let yargsFlagName = rawYargsFlagName;

				if (rawYargsFlagName.startsWith('no-')) {
					yargsFlagName = rawYargsFlagName.slice(3);
				}

				if (typeof rawArgs[yargsFlagName] !== 'undefined') {
					if (Array.isArray(rawArgs[yargsFlagName])) {
						error({
							message: `Flag --${yargsFlagName} can only be specified once`,
						});

						return;
					}

					switch (builderData.flagTag) {
						case 'boolean': {
							this.flags[camelCasedName] = rawYargsFlagName.startsWith('no-')
								? !rawArgs[yargsFlagName]
								: rawArgs[yargsFlagName];

							break;
						}
						case 'integer': {
							const parsed = Number(rawArgs[yargsFlagName]);

							if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
								error({
									message: `The provided value for the '--${yargsFlagName}' flag could not be processed as an integer.`,
								});

								return;
							}

							this.flags[camelCasedName] = parsed;

							break;
						}
						case 'string':
						default: {
							this.flags[camelCasedName] = rawArgs[yargsFlagName];

							if (rawArgs[yargsFlagName] === '-' && builderData.stdin) {
								this.flags[camelCasedName] = this._handleStdin(builderData.stdin);
							}

							if (!this.flags[camelCasedName]) {
								error({
									message: `Flag --${yargsFlagName} expects a value`,
								});

								return;
							}

							break;
						}
					}
				} else if (builderData.required) {
					error({
						message: `Flag --${yargsFlagName} is required`,
					});

					return;
				} else if (typeof builderData.hasDefault !== 'undefined') {
					this.flags[camelCasedName] = builderData.hasDefault;
				}
			}
		}

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

	private _buildCommandStrings(nameOverride?: string): readonly string[] {
		let baseDefinition = `${nameOverride || this.ctor.name}`;

		if (this.ctor.args) {
			let setCatchAll = false;

			for (const [key, internalBuilderData] of Object.entries(this.ctor.args)) {
				if (typeof internalBuilderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				// We mark all args as optional, even if they are not, to pretty-print a help message ourselves
				if (internalBuilderData.catchAll) {
					if (setCatchAll) {
						throw new RangeError('Only one catch-all argument is allowed in a command');
					}

					setCatchAll = true;
					baseDefinition += ` [${key}...]`;
				} else {
					baseDefinition += ` [${key}]`;
				}
			}
		}

		return [baseDefinition, ...(this.ctor.aliases ?? [])];
	}

	private _buildCommandBuilder(): CommandBuilder | undefined {
		return (yargs) => {
			let finalYargs = yargs;

			if (this.ctor.args) {
				for (const [key, internalBuilderData] of Object.entries(this.ctor.args)) {
					if (typeof internalBuilderData === 'string') {
						throw new RangeError(
							'Do not provide the string for the json arg! It is a type level assertion!',
						);
					}

					// Skip the "json" argument, as it is reserved for the --json flag
					if (key.toLowerCase() === 'json') {
						continue;
					}

					finalYargs = internalBuilderData.builder(finalYargs, key);
				}
			}

			if (this.ctor.flags) {
				for (const [key, internalBuilderData] of Object.entries(this.ctor.flags)) {
					if (typeof internalBuilderData === 'string') {
						throw new RangeError(
							'Do not provide the string for the json flag! It is a type level assertion!',
						);
					}

					// Skip the "json" flag, as it is set by enableJsonFlag
					if (key.toLowerCase() === 'json') {
						continue;
					}

					const flagKey = kebabCaseString(camelCaseToKebabCase(key)).toLowerCase();

					// yargs handles "no-" flags by negating the flag, so we need to handle that differently if we register a flag with a "no-" prefix
					if (flagKey.startsWith('no-')) {
						finalYargs = internalBuilderData.builder(finalYargs, flagKey.slice(3));
					} else {
						finalYargs = internalBuilderData.builder(finalYargs, flagKey);
					}
				}
			}

			if (this.ctor.subcommands?.length) {
				for (const SubCommandClass of this.ctor.subcommands) {
					const yargsObject = new SubCommandClass(`${this.entrypoint} ${this.ctor.name}`)._toYargs();

					finalYargs = finalYargs.command(yargsObject);
				}
			}

			// Register --json
			if (this.ctor.enableJsonFlag) {
				finalYargs = finalYargs.option('json', {
					boolean: true,
					describe: 'Format output as json.',
				});
			}

			return finalYargs;
		};
	}

	private _toYargs(): CommandModule[] {
		const baseCmd: CommandModule = {
			handler: this._run.bind(this),
			command: this._buildCommandStrings(),
			describe: this.ctor.hidden ? false : this.ctor.description,
			builder: this._buildCommandBuilder(),
		};

		const baseCommands: CommandModule[] = [
			{
				...baseCmd,
				aliases: this.ctor.aliases,
			},
		];

		if (this.ctor.hiddenAliases?.length) {
			for (const alias of this.ctor.hiddenAliases) {
				baseCommands.push({
					...baseCmd,
					command: this._buildCommandStrings(alias),
					describe: false,
				});
			}
		}

		return baseCommands;
	}

	static registerCommand(entrypoint: string, yargsInstance: Argv) {
		const instance = new (this as typeof BuiltApifyCommand)(entrypoint);

		const yargsObject = instance._toYargs();

		yargsInstance.command(yargsObject);

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
	const rawObject: ArgumentsCamelCase = {
		_: [],
		$0: 'apify',
	};

	for (const [key, value] of Object.entries(argsFlags)) {
		const [type, rawKey] = key.split('_');

		if (type === 'args') {
			rawObject[rawKey] = value;
		} else {
			const yargsFlagName = kebabCaseString(camelCaseToKebabCase(rawKey)).toLowerCase();

			// We handle "no-" flags differently, as yargs handles them by negating the base flag name (no-prompt -> prompt=false)
			if (yargsFlagName.startsWith('no-')) {
				rawObject[yargsFlagName.slice(3)] = !value;
			} else {
				rawObject[yargsFlagName] = value;
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
