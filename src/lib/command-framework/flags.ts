import type { ParseArgsOptionDescriptor } from 'node:util';

import { camelCaseToKebabCase, kebabCaseString, StdinMode } from './apify-command.js';

export type FlagTag = 'string' | 'boolean' | 'integer';

export interface BaseFlagOptions {
	required?: boolean;
	description?: string;
	aliases?: readonly string[];
	char?: string;
	hidden?: boolean;
	/**
	 * Maps to the `conflicts` option in yargs, ensures that if this flag is set, others in the array cannot be
	 */
	exclusive?: readonly string[];
	/**
	 * Whether the argument should be prefilled from stdin
	 * @default false
	 */
	stdin?: StdinMode;
}

export interface StringFlagOptions<Choices extends readonly string[] = readonly string[]> extends BaseFlagOptions {
	choices?: Choices;
	default?: string;
}

export interface BooleanFlagOptions extends BaseFlagOptions {
	default?: boolean;
}

export interface IntegerFlagOptions extends BaseFlagOptions {
	choices?: readonly number[];
	default?: number;
}

type FlagBuilderReturn = { flagName: string; option: ParseArgsOptionDescriptor }[];

export interface TaggedFlagBuilder<
	Tag extends FlagTag,
	ChoicesType extends readonly string[] | null,
	Required = boolean,
	HasDefault = false,
> {
	flagTag: Tag;
	builder: (objectName: string) => FlagBuilderReturn;
	choices: ChoicesType;
	required: Required;
	hasDefault: HasDefault;
	stdin: StdinMode;

	// Fields from the options object
	description: string | undefined;
	aliases: readonly string[] | undefined;
	char: string | undefined;
	hidden: boolean | undefined;
	exclusive: readonly string[] | undefined;
}

export const Flags = {
	string: stringFlag,
	boolean: booleanFlag,
	integer: integerFlag,
};

function stringFlag<const Choices extends string[], const T extends StringFlagOptions<readonly string[]>>(
	options: T & { choices?: Choices },
): TaggedFlagBuilder<'string', Choices, T['default'] extends string ? true : T['required'], T['default']> {
	return {
		flagTag: 'string',
		builder: (objectName) => {
			const allAliases = new Set([...(options.aliases ?? [])]);

			allAliases.delete(objectName);

			const returnValue: FlagBuilderReturn = [
				{
					flagName: objectName,
					option: {
						type: 'string',
						// We specify true here to throw a nicer error later if the user passes multiple values / future proofing
						multiple: true,
					},
				},
			];

			if (options.char) {
				returnValue[0].option.short = options.char;
			}

			for (const alias of allAliases) {
				returnValue.push({
					flagName: kebabCaseString(camelCaseToKebabCase(alias)).toLowerCase(),
					option: {
						type: 'string',
						multiple: true,
					},
				});
			}

			return returnValue;
		},
		choices: options.choices as Choices,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
		stdin: options.stdin ?? StdinMode.Stringified,

		description: options.description,
		aliases: options.aliases,
		char: options.char,
		hidden: options.hidden,
		exclusive: options.exclusive,
	};
}

function booleanFlag<const T extends BooleanFlagOptions>(
	options: T,
): TaggedFlagBuilder<'boolean', never, T['default'] extends boolean ? true : T['required'], T['default']> {
	return {
		flagTag: 'boolean',
		builder: (objectName) => {
			const allAliases = new Set([...(options.aliases ?? [])]);

			allAliases.delete(objectName);

			const returnValue: FlagBuilderReturn = [
				{
					flagName: objectName,
					option: {
						type: 'boolean',
						multiple: true,
					},
				},
			];

			if (options.char) {
				returnValue[0].option.short = options.char;
			}

			for (const alias of allAliases) {
				returnValue.push({
					flagName: kebabCaseString(camelCaseToKebabCase(alias)).toLowerCase(),
					option: {
						type: 'boolean',
						multiple: true,
					},
				});
			}

			return returnValue;
		},
		choices: null as never,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
		stdin: options.stdin ?? StdinMode.Raw,

		description: options.description,
		aliases: options.aliases,
		char: options.char,
		hidden: options.hidden,
		exclusive: options.exclusive,
	};
}

function integerFlag<const T extends IntegerFlagOptions>(
	options: T,
): TaggedFlagBuilder<'integer', never, T['default'] extends number ? true : T['required'], T['default']> {
	return {
		flagTag: 'integer',
		builder: (objectName) => {
			const allAliases = new Set([...(options.aliases ?? [])]);

			allAliases.delete(objectName);

			const returnValue: FlagBuilderReturn = [
				{
					flagName: objectName,
					option: {
						type: 'string',
						// We specify true here to throw a nicer error later if the user passes multiple values / future proofing
						multiple: true,
					},
				},
			];

			if (options.char) {
				returnValue[0].option.short = options.char;
			}

			for (const alias of allAliases) {
				returnValue.push({
					flagName: kebabCaseString(camelCaseToKebabCase(alias)).toLowerCase(),
					option: {
						type: 'string',
						multiple: true,
					},
				});
			}

			return returnValue;
		},
		choices: null as never,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
		stdin: options.stdin ?? StdinMode.Raw,

		description: options.description,
		aliases: options.aliases,
		char: options.char,
		hidden: options.hidden,
		exclusive: options.exclusive,
	};
}
