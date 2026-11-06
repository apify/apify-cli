import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { info, simpleLog } from '../../lib/outputs.js';
import {
	getServerDefinition,
	listServerOperations,
	resolveServerActor,
	resolveServerBuild,
	shortenSummary,
} from '../../lib/server-actor.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class ServerEndpointsCommand extends ApifyCommand<typeof ServerEndpointsCommand> {
	static override name = 'endpoints' as const;

	static override enableProfileFlag = true;

	static override description =
		'Lists the HTTP endpoints of a Server Actor, read from the web server schema of the build that serves its server interface.';

	static override examples = [
		{
			description: 'List the endpoints of an Actor.',
			command: 'apify server endpoints apify/rag-web-browser',
		},
		{
			description: 'Print the endpoints as JSON.',
			command: 'apify server endpoints apify/rag-web-browser --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-server-endpoints';

	static override args = {
		target: Args.string({
			description: 'The Actor ID or "username/name". Defaults to the Actor in the current directory.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const client = await getLoggedClientOrThrow();
		const actor = await resolveServerActor(client, this.args.target);
		const build = await resolveServerBuild(client, actor);
		const { webServerSchema, webServerMcpPath } = getServerDefinition(build);
		const operations = listServerOperations(webServerSchema);

		if (this.flags.json) {
			printJsonToStdout({
				url: actor.standbyUrl,
				tenancy: actor.tenancy ?? null,
				build: { ref: actor.buildRef, id: build.id, buildNumber: build.buildNumber },
				operations,
				mcpPath: webServerMcpPath ?? null,
			});
			return;
		}

		for (const operation of operations) {
			const summary = operation.summary ? `  ${shortenSummary(operation.summary)}` : '';
			simpleLog({ message: `${operation.method.padEnd(7)} ${operation.path}${summary}`, stdout: true });
		}

		if (webServerMcpPath) {
			simpleLog({ message: `${'MCP'.padEnd(7)} ${webServerMcpPath}`, stdout: true });
		}

		if (operations.length === 0 && !webServerMcpPath) {
			info({
				message:
					`Actor "${actor.userFriendlyId}" does not document its endpoints. ` +
					`See its README: apify actors info ${actor.userFriendlyId} --readme`,
			});
		}
	}
}
