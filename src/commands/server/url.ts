import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { simpleLog } from '../../lib/outputs.js';
import { resolveServerActor } from '../../lib/server-actor.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class ServerUrlCommand extends ApifyCommand<typeof ServerUrlCommand> {
	static override name = 'url' as const;

	static override enableProfileFlag = true;

	static override description = "Prints the URL of a Server Actor's server interface.";

	static override examples = [
		{
			description: 'Print the server interface URL of an Actor.',
			command: 'apify server url apify/rag-web-browser',
		},
		{
			description: 'Print the URL of the Actor in the current directory.',
			command: 'apify server url',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-server-url';

	static override args = {
		target: Args.string({
			description: 'The Actor ID or "username/name". Defaults to the Actor in the current directory.',
		}),
	};

	async run() {
		const client = await getLoggedClientOrThrow();
		const actor = await resolveServerActor(client, this.args.target);

		simpleLog({ message: actor.standbyUrl, stdout: true });
	}
}
