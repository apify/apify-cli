import { META_ORIGINS } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { simpleLog } from '../../lib/outputs.js';
import {
	getServerDefinition,
	isMultiTenant,
	listServerOperations,
	resolveServerActor,
	resolveServerBuild,
} from '../../lib/server-actor.js';
import { getCurrentUserInfo, getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class ServerStatusCommand extends ApifyCommand<typeof ServerStatusCommand> {
	static override name = 'status' as const;

	static override enableProfileFlag = true;

	static override description =
		"Shows how a Server Actor's server interface is configured and, for single-tenant Actors, the runs serving you. " +
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

		// A multi-tenant Actor runs in the developer's account, so the caller has no runs to list.
		let runs: { id: string; startedAt: Date }[] | undefined;
		let username: string | undefined;

		if (!multiTenant) {
			const { items } = await client.runs().list({ status: 'RUNNING', desc: true, limit: 1000 });
			runs = items
				.filter((run) => run.actId === actor.id && run.meta?.origin === META_ORIGINS.STANDBY)
				.map(({ id, startedAt }) => ({ id, startedAt }));
			({ username } = await getCurrentUserInfo());
		}

		if (this.flags.json) {
			printJsonToStdout({
				url: actor.standbyUrl,
				tenancy: actor.tenancy ?? null,
				build: { ref: actor.buildRef, id: build.id, buildNumber: build.buildNumber },
				memoryMbytes: standby.memoryMbytes ?? null,
				idleTimeoutSecs: standby.idleTimeoutSecs ?? null,
				desiredRequestsPerActorRun: standby.desiredRequestsPerActorRun ?? null,
				maxRequestsPerActorRun: standby.maxRequestsPerActorRun ?? null,
				operationCount: operations.length,
				mcpPath: webServerMcpPath ?? null,
				runs: runs ?? null,
			});
			return;
		}

		const tenancyLine = multiTenant
			? "multi-tenant (runs in the developer's account; you pay per event)"
			: `single-tenant (runs in your account "${username}", which pays the platform usage)`;

		const endpointsLine =
			operations.length > 0
				? `${operations.length} documented (apify server endpoints ${actor.userFriendlyId})`
				: 'not documented (see the Actor README)';

		const lines = [
			`URL:            ${actor.standbyUrl}`,
			`Tenancy:        ${tenancyLine}`,
			`Build:          ${actor.buildRef} (${build.buildNumber})`,
			`Memory:         ${standby.memoryMbytes ?? '-'} MB`,
			`Idle timeout:   ${standby.idleTimeoutSecs ?? '-'} s`,
			`Requests/run:   ${standby.desiredRequestsPerActorRun ?? '-'} desired, ${standby.maxRequestsPerActorRun ?? '-'} max`,
			`Endpoints:      ${endpointsLine}`,
			...(webServerMcpPath ? [`MCP path:       ${webServerMcpPath}`] : []),
		];

		if (runs) {
			lines.push(
				runs.length > 0
					? `Runs:           ${runs.length} running (${runs.map((run) => run.id).join(', ')}); the next request is served warm`
					: 'Runs:           none running; the next request starts one (cold start)',
			);
		}

		simpleLog({ message: lines.join('\n'), stdout: true });
	}
}
