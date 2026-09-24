import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AuthListCommand } from './list.js';
import { AuthLoginCommand } from './login.js';
import { AuthLogoutCommand } from './logout.js';
import { AuthSwitchCommand } from './switch.js';
import { AuthTokenCommand } from './token.js';

export class AuthIndexCommand extends ApifyCommand<typeof AuthIndexCommand> {
	static override name = 'auth' as const;

	static override description =
		'Log in, log out, switch between stored accounts, and inspect your stored Apify API token. Also available as `apify login` / `apify logout`.';

	static override group = 'Authentication';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth';

	static override subcommands = [
		AuthLoginCommand,
		AuthLogoutCommand,
		AuthListCommand,
		AuthSwitchCommand,
		AuthTokenCommand,
	];

	async run() {
		this.printHelp();
	}
}
