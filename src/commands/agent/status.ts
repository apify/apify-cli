import process from 'node:process';

import chalk from 'chalk';

import { readAgentState } from '../../lib/agent/state.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { isSupportedClient, SUPPORTED_CLIENTS } from '../../lib/mcp/clients.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

export class AgentStatusCommand extends ApifyCommand<typeof AgentStatusCommand> {
	static override name = 'status' as const;

	static override description =
		'Show which AI coding agents have been configured by `apify agent setup`, along with their tier and install date.';

	static override group = 'Agent';

	static override enableJsonFlag = true;

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-agent-status';

	static override examples = [
		{
			description: 'Show all configured agents.',
			command: 'apify agent status',
		},
		{
			description: 'Check whether Cursor is configured.',
			command: 'apify agent status --client cursor',
		},
		{
			description: 'Machine-readable output.',
			command: 'apify agent status --json',
		},
	];

	static override flags = {
		client: Flags.string({
			description: `Show status for a specific client only. One of: ${SUPPORTED_CLIENTS.join(', ')}.`,
		}),
	};

	async run() {
		const { client: clientFlag, json } = this.flags;

		if (clientFlag && !isSupportedClient(clientFlag)) {
			error({
				message: `Unknown client '${clientFlag}'. Supported: ${SUPPORTED_CLIENTS.join(', ')}.`,
			});
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}

		const state = await readAgentState();

		if (!state || state.clients.length === 0) {
			simpleLog({
				message: 'No agents configured. Run `apify agent setup` to get started.',
			});
			if (json) printJsonToStdout({ clients: [] });
			return;
		}

		const clients = clientFlag !== undefined ? state.clients.filter((r) => r.client === clientFlag) : state.clients;

		if (clients.length === 0) {
			simpleLog({
				message: `'${clientFlag}' is not configured. Run \`apify agent setup --client ${clientFlag}\` to configure it.`,
			});
			if (json) printJsonToStdout({ clients: [] });
			return;
		}

		const lines = clients.map(
			(r) =>
				`  ${chalk.bold(r.client.padEnd(18))}  ${chalk.cyan(`[${r.tier} tier]`)}  configured ${new Date(r.installedAt).toLocaleDateString()}`,
		);

		simpleLog({
			message: [`\nConfigured agents (${clients.length}):`, ...lines, ''].join('\n'),
		});

		if (json) printJsonToStdout({ clients });
	}
}
