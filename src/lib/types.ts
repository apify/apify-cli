import type { BuiltApifyCommand } from './command-framework/apify-command.js';

export function OverrideClassName<T extends typeof BuiltApifyCommand>(clazz: T): typeof BuiltApifyCommand {
	return clazz;
}
