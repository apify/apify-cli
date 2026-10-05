import process from 'node:process';

import chalk from 'chalk';

import { isClientConfigured, readAgentState, writeAgentState } from '../../lib/agent/state.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import {
	getClientUninstallHandler,
	isSupportedClient,
	type ClientName,
	SUPPORTED_CLIENTS,
} from '../../lib/mcp/clients.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

type UninstallOutcome = 'uninstalled' | 'not_configured' | 'failed';

interface UninstallResult {
	client: string;
	outcome: UninstallOutcome;
	reason?: string;
}

export class AgentUninstallCommand extends ApifyCommand<typeof AgentUninstallCommand> {
	static override name = 'uninstall' as const;

	static override description =
		'Remove Apify MCP configuration from AI coding agents previously set up by `apify agent setup`. Updates the local state file.';

	static override group = 'Agent';

	static override interactive = true;

	static override interactiveNote =
		'Prompts once before removing. Pass --yes to skip. Pass --non-interactive to suppress all prompts.';

	static override enableJsonFlag = true;

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-agent-uninstall';

	static override examples = [
		{
			description: 'Uninstall all configured agents (prompts for confirmation).',
			command: 'apify agent uninstall',
		},
		{
			description: 'Uninstall Cursor without a confirmation prompt.',
			command: 'apify agent uninstall --client cursor --yes',
		},
		{
			description: 'Machine-readable uninstall from a CI script.',
			command: 'apify agent uninstall --yes --json',
		},
	];

	static override flags = {
		...YesFlag('Skip the confirmation prompt and remove immediately.'),
		client: Flags.string({
			description: `Target a specific client. One of: ${SUPPORTED_CLIENTS.join(', ')}. Omit to uninstall all configured clients.`,
		}),
	};

	async run() {
		const { yes, client: clientFlag, json } = this.flags;

		if (clientFlag && !isSupportedClient(clientFlag)) {
			error({
				message: `Unknown client '${clientFlag}'. Supported: ${SUPPORTED_CLIENTS.join(', ')}.`,
			});
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}

		// ── Step 1: Determine targets from state file ────────────────────────
		const state = await readAgentState();

		let targets: ClientName[];

		if (clientFlag) {
			const typedClient = clientFlag as ClientName;
			if (!state || !isClientConfigured(state, typedClient)) {
				simpleLog({
					message: `'${clientFlag}' is not configured. Nothing to uninstall.`,
				});
				if (json)
					printJsonToStdout({
						clients: [{ client: clientFlag, outcome: 'not_configured' }],
					});
				return;
			}
			targets = [typedClient];
		} else {
			if (!state || state.clients.length === 0) {
				simpleLog({
					message: 'No agents configured. Nothing to uninstall.',
				});
				if (json) printJsonToStdout({ clients: [] });
				return;
			}
			targets = state.clients
				.filter((r) => {
					if (!isSupportedClient(r.client)) {
						error({
							message: `Skipping unknown client '${r.client}' found in state file.`,
						});
						return false;
					}
					return true;
				})
				.map((r) => r.client as ClientName);

			if (targets.length === 0) {
				simpleLog({
					message: 'No agents configured. Nothing to uninstall.',
				});
				if (json) printJsonToStdout({ clients: [] });
				return;
			}
		}

		// ── Step 2: Show plan, confirm ────────────────────────────────────────
		const planLines = targets.map((c) => `  ${chalk.bold(c)}`);
		simpleLog({
			message: [
				`\nWill remove Apify MCP configuration for ${targets.length} agent${targets.length === 1 ? '' : 's'}:`,
				...planLines,
			].join('\n'),
		});

		const confirmed = await useYesNoConfirm({
			message: 'Remove the configuration above?',
			default: false,
			providedConfirmFromStdin: yes || undefined,
			errorMessageForStdin: 'Re-run with --yes to skip this prompt.',
		});

		if (!confirmed) {
			simpleLog({ message: 'Aborted. No changes were made.' });
			if (json) printJsonToStdout({ clients: [] });
			return;
		}

		// ── Step 3: Apply per client ─────────────────────────────────────────
		const results: UninstallResult[] = [];
		let anyFailed = false;

		for (const client of targets) {
			process.exitCode = undefined;
			try {
				await getClientUninstallHandler(client)();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				error({
					message: `Failed to uninstall '${client}': ${message}`,
				});
				results.push({ client, outcome: 'failed', reason: message });
				anyFailed = true;
				process.exitCode = undefined;
				continue;
			}

			if (process.exitCode !== undefined) {
				results.push({
					client,
					outcome: 'failed',
					reason: `exit ${String(process.exitCode)}`,
				});
				anyFailed = true;
				process.exitCode = undefined;
			} else {
				results.push({ client, outcome: 'uninstalled' });
			}
		}

		if (anyFailed) {
			process.exitCode = CommandExitCodes.RunFailed;
		}

		// ── Step 4: Update state file ────────────────────────────────────────
		const uninstalledClients = new Set(results.filter((r) => r.outcome === 'uninstalled').map((r) => r.client));

		if (uninstalledClients.size > 0 && state) {
			const newState = {
				...state,
				clients: state.clients.filter((r) => !uninstalledClients.has(r.client)),
			};
			try {
				await writeAgentState(newState);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				error({
					message: `Failed to update state file: ${message}. Re-run to sync state.`,
				});
				if (!anyFailed) process.exitCode = CommandExitCodes.RunFailed;
			}
		}

		// ── Step 5: Machine-readable output ─────────────────────────────────
		if (json) {
			printJsonToStdout({
				clients: results.map(({ reason: _reason, ...rest }) => rest),
			});
		}
	}
}
