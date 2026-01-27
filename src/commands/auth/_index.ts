import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AuthLoginCommand } from './login.js';
import { AuthLogoutCommand } from './logout.js';
import { AuthTokenCommand } from './token.js';

export class AuthIndexCommand extends ApifyCommand<typeof AuthIndexCommand> {
	static override name = 'auth' as const;

	static override description = 'Manages authentication for Apify CLI.';

	static override subcommands = [AuthLoginCommand, AuthLogoutCommand, AuthTokenCommand];

	async run() {
		this.printHelp();
	}
}
