import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AuthLoginCommand } from './login.js';
import { AuthLogoutCommand } from './logout.js';
import { AuthTokenCommand } from './token.js';

export class AuthIndexCommand extends ApifyCommand<typeof AuthIndexCommand> {
	static override name = 'auth' as const;

	static override description =
		'Log in, log out, and inspect your stored Apify API token. Convenience aliases are also exposed at the top level as `apify login` / `apify logout`.';

	static override group = 'Authentication';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth';

	static override subcommands = [AuthLoginCommand, AuthLogoutCommand, AuthTokenCommand];

	async run() {
		this.printHelp();
	}
}
