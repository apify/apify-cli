import { ActorsCallCommand } from '../src/commands/actors/call';
import { TopLevelCallCommand } from '../src/commands/call';
import { LoginCommand } from '../src/commands/login';
import { LogoutCommand } from '../src/commands/logout';
import type { BuiltApifyCommand } from '../src/lib/command-framework/apify-command';
import type { BaseCommandRenderer } from '../src/lib/command-framework/help/_BaseCommandRenderer';

interface CommandsInCategory extends Partial<Parameters<BaseCommandRenderer['selectiveRender']>[0]> {
	command: typeof BuiltApifyCommand;
	aliases?: (typeof BuiltApifyCommand)[];
}

const Commands = {
	call: TopLevelCallCommand,
	login: LoginCommand,
	logout: LogoutCommand,
	actorsCall: ActorsCallCommand,
};

// render description in code block, then usage, no short description after command header

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const categories: Record<string, CommandsInCategory[]> = {
	'auth-commands': [
		//
		{ command: Commands.login },
		{ command: Commands.logout },
		{ command: Commands.actorsCall, aliases: [Commands.call] },
	],
	'actor-commands': [
		//
		{ command: Commands.call, aliases: [Commands.call] },
	],
	'general-commands': [
		//
	],
	'dataset-commands': [
		//
	],
	'key-value-store-commands': [
		//
	],
};
