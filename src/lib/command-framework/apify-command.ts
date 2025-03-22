/* eslint-disable max-classes-per-file */

import type { Awaitable } from '@crawlee/types';
import type { ArgumentsCamelCase, Argv, CommandBuilder, CommandModule } from 'yargs';

import type { ArgTag, TaggedArgBuilder } from './args.js';
import type { FlagTag, TaggedFlagBuilder } from './flags.js';
import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { error } from '../outputs.js';

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
	Builder extends TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>,
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
	O extends Record<string, TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>>,
	OptionalIfHasDefault = false,
> = {
	[K in keyof O as CamelCase<string & K>]: InferFlagTypeFromFlag<O[K], OptionalIfHasDefault>;
};

type InferArgsFromCommand<O extends Record<string, TaggedArgBuilder<ArgTag, unknown>> | undefined> = O extends undefined
	? Record<string, unknown>
	: _InferArgsFromCommand<Exclude<O, undefined>>;

type InferFlagsFromCommand<
	O extends Record<string, TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>> | undefined,
	OptionalIfHasDefault = false,
> = (O extends undefined
	? Record<string, unknown>
	: _InferFlagsFromCommand<Exclude<O, undefined>, OptionalIfHasDefault>) & { json: boolean };

function camelCaseString(str: string): string {
	return str.replace(/[-_\s](.)/g, (_, group1) => group1.toUpperCase());
}

function kebabCaseString(str: string): string {
	return str.replace(/[\s_]+/g, '-');
}

function camelCaseToKebabCase(str: string): string {
	return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export abstract class ApifyCommand<T extends typeof BuiltApifyCommand = typeof BuiltApifyCommand> {
	static args?: Record<string, TaggedArgBuilder<ArgTag, unknown>> & {
		json?: 'Do not use json as the key of an argument, as it will prevent the --json flag from working';
	};

	static flags?: Record<string, TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>> & {
		json?: 'Do not use json as the key of a flag, override the enableJsonFlag static property instead';
	};

	static subcommands?: (typeof BuiltApifyCommand)[];

	static enableJsonFlag = false;

	static description?: string;

	static name: string;

	static aliases?: string[];

	static hidden?: boolean;

	static hiddenAliases?: string[];

	protected telemetryData: Record<string, unknown> = {};

	protected flags!: InferFlagsFromCommand<T['flags']>;
	protected args!: InferArgsFromCommand<T['args']>;

	abstract run(): Awaitable<void>;

	protected get ctor(): typeof ApifyCommand {
		return this.constructor as typeof ApifyCommand;
	}

	protected pluralString(amount: number, singular: string, plural: string): string {
		return amount === 1 ? singular : plural;
	}

	protected printHelp() {
		console.log(`TODO!!! Command ${this.ctor.name} wants to print help manually`);
	}

	private async _run(rawArgs: ArgumentsCamelCase) {
		// Cheating a bit here with the types, but its fine
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- makes parsing easier
		this.args = {} as any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- makes parsing easier
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

							break;
					}
				}
			}
		}

		if (this.ctor.flags) {
			for (const [userFlagName, builderData] of Object.entries(this.ctor.flags)) {
				if (typeof builderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				const yargsFlagName = kebabCaseString(camelCaseToKebabCase(userFlagName)).toLowerCase();
				const camelCasedName = camelCaseString(yargsFlagName);

				if (typeof rawArgs[yargsFlagName] !== 'undefined') {
					switch (builderData.flagTag) {
						case 'boolean': {
							this.flags[camelCasedName] = rawArgs[yargsFlagName];
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

							break;
						}
					}
				}
			}
		}

		// TODO: remove me
		// console.log({ rawInput: rawArgs, args: this.args, flags: this.flags });

		try {
			await this.run();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			// TODO: handle errors gracefully with a logger
			console.error(err.message);
		}
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
			for (const [key, internalBuilderData] of Object.entries(this.ctor.args)) {
				if (typeof internalBuilderData === 'string') {
					throw new RangeError('Do not provide the string for the json arg! It is a type level assertion!');
				}

				if (internalBuilderData.required) {
					baseDefinition += ` <${key}>`;
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

					finalYargs = internalBuilderData.builder(finalYargs, flagKey);
				}
			}

			if (this.ctor.subcommands?.length) {
				for (const SubCommandClass of this.ctor.subcommands) {
					// eslint-disable-next-line no-underscore-dangle
					const yargsObject = new SubCommandClass()._toYargs();

					finalYargs = finalYargs.command(yargsObject);
				}
			}

			// Register --json
			if (this.ctor.enableJsonFlag) {
				finalYargs = finalYargs.option('json', { boolean: true, describe: 'Format output as json.' });
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
				baseCommands.push({ ...baseCmd, command: this._buildCommandStrings(alias), describe: false });
			}
		}

		return baseCommands;
	}

	static registerCommand(yargsInstance: Argv) {
		const instance = new (this as typeof BuiltApifyCommand)();

		// eslint-disable-next-line no-underscore-dangle -- We mark the function with `_` to semi-signal it should not be called outside internal code
		const yargsObject = instance._toYargs();

		yargsInstance.command(yargsObject);
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

export async function runCommand<Cmd extends typeof BuiltApifyCommand>(
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

			rawObject[yargsFlagName] = value;
		}
	}

	const instance = new (command as typeof BuiltApifyCommand)();

	// eslint-disable-next-line dot-notation
	await instance['_run'](rawObject);
}

export declare class BuiltApifyCommand extends ApifyCommand {
	override run(): Awaitable<void>;
}

export enum StdinMode {
	Raw = 1,
	Stringified = 2,
}
