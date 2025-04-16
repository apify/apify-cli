import { apifyCommands } from '../../src/commands/_register';

function camelCaseString(str: string): string {
	return str.replace(/[-_\s](.)/g, (_, group1) => group1.toUpperCase());
}

// Adapted from https://gist.github.com/kuroski/9a7ae8e5e5c9e22985364d1ddbf3389d to support kebab-case and "string a"
type CamelCase<S extends string> = S extends
	| `${infer P1}-${infer P2}${infer P3}`
	| `${infer P1}_${infer P2}${infer P3}`
	| `${infer P1} ${infer P2}${infer P3}`
	? `${P1}${Uppercase<P2>}${CamelCase<P3>}`
	: S;

type UppercaseFirst<S extends string> = S extends `${infer P1}${infer P2}${infer P3}`
	? `${Uppercase<P1>}${P2}${P3}`
	: S;

type _WithSubcommandsFilter<T extends readonly unknown[]> = {
	[K in keyof T]: T[K] extends { subcommands: readonly unknown[] }
		? T[K]['subcommands']['length'] extends 0
			? never
			: T[K]
		: never;
}[number];

type _CommandClassesWithSubcommands = _WithSubcommandsFilter<typeof apifyCommands>;

// Type gymnastics to get the subcommands of each command into one union of them all
type _RecordOfCommandSubcommands<Cmd extends _CommandClassesWithSubcommands> = {
	[CmdName in Cmd['name'] as CamelCase<CmdName>]: {
		[SubCmdName in (Cmd & { name: CmdName })['subcommands'][number]['name'] as CamelCase<SubCmdName>]: {
			fullName: `${CamelCase<CmdName>}${UppercaseFirst<CamelCase<SubCmdName>>}`;
			clazz: (Cmd & { name: CmdName })['subcommands'][number] & {
				name: SubCmdName;
				parent: Cmd & { name: CmdName };
			};
		};
	}[CamelCase<(Cmd & { name: CmdName })['subcommands'][number]['name']>];
}[CamelCase<Cmd['name']>];

type RecordOfCommandSubcommands = _RecordOfCommandSubcommands<_CommandClassesWithSubcommands>;

type CommandsRecord = {
	[K in (typeof apifyCommands)[number]['name'] as CamelCase<K>]: (typeof apifyCommands)[number] & { name: K };
} & {
	[K in RecordOfCommandSubcommands['fullName']]: (RecordOfCommandSubcommands & { fullName: K })['clazz'];
};

export const Commands: CommandsRecord = {} as CommandsRecord;

for (const command of apifyCommands) {
	Commands[camelCaseString(command.name)] = command;

	for (const subcommand of command.subcommands ?? []) {
		Commands[camelCaseString(`${command.name} ${subcommand.name}`)] = subcommand;
		// @ts-expect-error Adding for docs only
		subcommand.parent = command;
	}
}
