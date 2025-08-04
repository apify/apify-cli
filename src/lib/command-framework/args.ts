import { StdinMode } from './apify-command.js';

export type ArgTag = 'string';

export interface BaseArgOptions {
	required?: boolean;
	description?: string;
	aliases?: readonly string[];
	/**
	 * Whether the argument should be prefilled from stdin
	 * @default false
	 */
	stdin?: StdinMode;
	/**
	 * Whether this argument should collect everything after it
	 * @default false
	 */
	catchAll?: boolean;
}

export type StringArgOptions = BaseArgOptions;

export interface TaggedArgBuilder<Tag extends ArgTag, Required = boolean> {
	argTag: Tag;
	required: Required;
	stdin: StdinMode;

	// Options from the object
	description: string | undefined;
	aliases: readonly string[] | undefined;
	catchAll: boolean;
}

function stringArg<const T extends StringArgOptions>(option: T): TaggedArgBuilder<'string', T['required']> {
	return {
		argTag: 'string',
		required: option.required ?? false,
		stdin: option.stdin ?? StdinMode.Raw,

		description: option.description,
		aliases: option.aliases,
		catchAll: option.catchAll ?? false,
	};
}

export const Args = {
	string: stringArg,
};
