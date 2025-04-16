import type { BuiltApifyCommand } from './command-framework/apify-command.js';

export interface AuthJSON {
	token?: string;
	id?: string;
	username?: string;
	email?: string;
	proxy?: {
		password: string;
	};
	organizationOwnerUserId?: string;
}

export function OverrideClassName<T extends typeof BuiltApifyCommand>(clazz: T): typeof BuiltApifyCommand {
	return clazz;
}
