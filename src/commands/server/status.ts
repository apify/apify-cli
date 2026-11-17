import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { simpleLog } from '../../lib/outputs.js';
import type { ServerRun, ServerRunListItem } from '../../lib/server-actor.js';
import {
	describeServerRuns,
	describeServerSettings,
	describeTenancy,
	getPoolOwnerUsername,
	getServerDefinition,
	isMultiTenant,
	listServerOperations,
	resolveServerActor,
	resolveServerBuild,
	toServerRuns,
} from '../../lib/server-actor.js';
import { getCurrentUserInfo, getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class ServerStatusCommand extends ApifyCommand<typeof ServerStatusCommand> {
	static override name = 'status' as const;

	static override enableProfileFlag = true;

	static override description =
		"Shows how a Server Actor's server interface is configured, and the runs serving requests when they are in your account. " +
		'Never sends a request to the Actor, so it cannot start a run.';

	static override examples = [
		{
			description: 'Show the server interface of an Actor.',
			command: 'apify server status apify/rag-web-browser',
		},
		{
			description: 'Print the status as JSON.',
			command: 'apify server status apify/web-fetch --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-server-status';

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
		const multiTenant = isMultiTenant(actor);
		const { standby } = actor;

		const { username } = await getCurrentUserInfo();

		const poolOwnerUsername = getPoolOwnerUsername(actor);
		const isPoolOwner = multiTenant && username === actor.ownerUsername;

		// The pools of a multi-tenant Actor run in the owner's account, so only the owner can list them.
		let runs: ServerRun[] | undefined;

		if (!multiTenant || isPoolOwner) {
			const { items } = await client.actor(actor.id).runs().list({ status: 'RUNNING', desc: true });
			runs = toServerRuns(items as ServerRunListItem[]);
		}

		if (this.flags.json) {
			printJsonToStdout({
				url: actor.standbyUrl,
				tenancy: actor.tenancy ?? null,
				pricingModel: actor.pricingModel ?? null,
				build: { ref: actor.buildRef, id: build.id, buildNumber: build.buildNumber },
				memoryMbytes: standby.memoryMbytes ?? null,
				idleTimeoutSecs: standby.idleTimeoutSecs ?? null,
				desiredRequestsPerActorRun: standby.desiredRequestsPerActorRun ?? null,
				maxRequestsPerActorRun: standby.maxRequestsPerActorRun ?? null,
				operationCount: operations.length,
				mcpPath: webServerMcpPath ?? null,
				runs: runs ?? null,
				viewerUsername: username ?? null,
				poolOwnerUsername: poolOwnerUsername ?? null,
			});
			return;
		}

		const tenancyLine = describeTenancy(actor, username);

		const endpointsLine =
			operations.length > 0
				? `${operations.length} documented (apify server endpoints ${actor.userFriendlyId})`
				: 'not documented (see the Actor README)';

		const lines = [
			`URL:            ${actor.standbyUrl}`,
			`Tenancy:        ${tenancyLine}`,
			`Build:          ${actor.buildRef} (${build.buildNumber})`,
			...describeServerSettings(standby, poolOwnerUsername, username),
			`Endpoints:      ${endpointsLine}`,
			...(webServerMcpPath ? [`MCP path:       ${webServerMcpPath}`] : []),
			...(runs ? describeServerRuns(runs, isPoolOwner) : []),
		];

		simpleLog({ message: lines.join('\n'), stdout: true });
	}
}
