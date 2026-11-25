import type { BuiltApifyCommand } from './command-framework/apify-command.js';

export interface AuthJSON {
	token?: string;
	id?: string;
	username?: string;
	proxy?: {
		password?: string | null;
	};
	organizationOwnerUserId?: string | null;
}

export function OverrideClassName<T extends typeof BuiltApifyCommand>(clazz: T): typeof BuiltApifyCommand {
	return clazz;
}
