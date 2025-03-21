import type { Argv } from 'yargs';

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

export type TaggedFlagBuilder<Tag extends FlagTag, ChoicesType = unknown, Required = boolean, HasDefault = false> = {
	flagTag: Tag;
	builder: (args: Argv, objectName: string, extraArgs?: string[]) => Argv;
	choicesType: ChoicesType;
	required: Required;
	hasDefault: HasDefault;
};

export const Flags = {
	string: stringFlag,
	boolean: booleanFlag,
	integer: integerFlag,
};

function stringFlag<const Choices, const T extends StringFlagOptions<readonly string[]>>(
	options: T & { choices?: Choices },
): TaggedFlagBuilder<'string', Choices, T['default'] extends string ? true : T['required'], T['default']> {
	return {
		flagTag: 'string',
		builder: (args, objectName, extraAliases) => {
			const allAliases = new Set([...(options.aliases ?? []), ...(extraAliases ?? [])]);

			if (options.char) {
				allAliases.add(options.char);
			}

			allAliases.delete(objectName);

			return args.option(objectName, {
				demandOption: options.required ?? false,
				describe: options.description,
				alias: [...allAliases],
				hidden: options.hidden ?? false,
				conflicts: options.exclusive,
				default: options.default,
				choices: options.choices,
				string: true,
				nargs: 1,
				requiresArg: true,
			});
		},
		choicesType: options.choices as Choices,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
	};
}

function booleanFlag<const T extends BooleanFlagOptions>(
	options: T,
): TaggedFlagBuilder<'boolean', never, T['default'] extends boolean ? true : T['required'], T['default']> {
	return {
		flagTag: 'boolean',
		builder: (args, objectName, extraAliases) => {
			const allAliases = new Set([...(options.aliases ?? []), ...(extraAliases ?? [])]);

			if (options.char) {
				allAliases.add(options.char);
			}

			allAliases.delete(objectName);

			return args.option(objectName, {
				demandOption: options.required ?? false,
				describe: options.description,
				alias: [...allAliases],
				hidden: options.hidden ?? false,
				conflicts: options.exclusive,
				default: options.default,
				boolean: true,
			});
		},
		choicesType: null as never,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
	};
}

function integerFlag<const T extends IntegerFlagOptions>(
	options: T,
): TaggedFlagBuilder<'integer', never, T['default'] extends number ? true : T['required'], T['default']> {
	return {
		flagTag: 'integer',
		builder: (args, objectName, extraAliases) => {
			const allAliases = new Set([...(options.aliases ?? []), ...(extraAliases ?? [])]);

			if (options.char) {
				allAliases.add(options.char);
			}

			allAliases.delete(objectName);

			return args.option(objectName, {
				demandOption: options.required ?? false,
				describe: options.description,
				alias: [...allAliases],
				hidden: options.hidden ?? false,
				conflicts: options.exclusive,
				default: options.default,
				choices: options.choices,
				string: true,
				nargs: 1,
			});
		},
		choicesType: null as never,
		required: (options.required ?? false) as never,
		hasDefault: options.default,
	};
}
