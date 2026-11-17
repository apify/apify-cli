import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { ServerEndpointsCommand } from './endpoints.js';
import { ServerRequestCommand } from './request.js';
import { ServerStatusCommand } from './status.js';
import { ServerUrlCommand } from './url.js';

export class ServerIndexCommand extends ApifyCommand<typeof ServerIndexCommand> {
	static override name = 'server' as const;

	static override description = 'Send requests to a Server Actor and inspect its server interface.';

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-server';

	static override subcommands = [
		//
		ServerRequestCommand,
		ServerStatusCommand,
		ServerEndpointsCommand,
		ServerUrlCommand,
	];

	async run() {
		this.printHelp();
	}
}
