import type { Argv } from 'yargs';

export type ArgTag = 'string';

export interface BaseArgOptions {
	required?: boolean;
	description?: string;
	aliases?: readonly string[];
}

export type StringArgOptions = BaseArgOptions;

export type TaggedArgBuilder<Tag extends ArgTag, Required = boolean> = {
	argTag: Tag;
	builder: (args: Argv, objectName: string) => Argv;
	required: Required;
};

function stringArg<const T extends StringArgOptions>(option: T): TaggedArgBuilder<'string', T['required']> {
	return {
		argTag: 'string',
		builder: (args, objectName) => {
			args.positional(objectName, {
				...option,
				type: 'string',
			});

			return args;
		},
		required: option.required ?? false,
	};
}

export const Args = {
	string: stringArg,
};
