import process from 'node:process';

import chalk from 'chalk';

import { type ClientEntry, buildSetupMcpUrl, getClientEntry, type Tier } from '../../lib/agent/catalog.js';
import { detectClients } from '../../lib/agent/detection.js';
import { isClientConfigured, readAgentState, type AgentState, writeAgentState } from '../../lib/agent/state.js';
import { resolveAuth } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import {
	clientNeedsToken,
	getClientHandler,
	isSupportedClient,
	type ClientName,
	SUPPORTED_CLIENTS,
} from '../../lib/mcp/clients.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

type Outcome = 'installed' | 'already_configured' | 'failed';

interface SetupResult {
	client: string;
	tier: string;
	outcome: Outcome;
	reason?: string;
}

/**
 * Picks the highest tier the client supports AND the catalog has an artifact for.
 * When a plugin entry would be selected but its spec is not yet published (plugin: null),
 * falls back to mcp.
 */
function effectiveTier(entry: ClientEntry): Tier {
	if (entry.maxTier === 'plugin' && entry.plugin === null) return 'mcp';
	return entry.maxTier;
}

async function applyMcp(client: ClientName, mcpUrl: string, token: string): Promise<void> {
	await getClientHandler(client)({ url: mcpUrl, token, yes: true });
}

async function applyForClient(client: ClientName, entry: ClientEntry, mcpUrl: string, token: string): Promise<void> {
	const tier = effectiveTier(entry);

	if (tier === 'plugin') {
		// P1: plugin marketplace install — not yet implemented
		throw new Error(`Plugin tier not yet available for '${client}'. Try again after a catalog update.`);
	}

	if (tier === 'skills+mcp' || tier === 'mcp') {
		await applyMcp(client, mcpUrl, token);
		return;
	}

	// manual tier: print instructions only
	simpleLog({
		message: [
			`  Manual setup required for ${chalk.bold(client)}:`,
			`    Add the Apify MCP server to your client's config.`,
			`    URL: ${mcpUrl}`,
		].join('\n'),
	});
}

export class AgentSetupCommand extends ApifyCommand<typeof AgentSetupCommand> {
	static override name = 'setup' as const;

	static override description =
		'Auto-detect installed AI coding agents and configure them to use Apify tools via MCP. Detects clients by binary, environment variable, and config directory, then applies the best available integration tier.';

	static override group = 'Agent';

	static override interactive = true;

	static override interactiveNote =
		'Prompts once before applying changes. Pass --yes to skip the prompt. Pass --non-interactive to suppress all prompts (exits non-zero when a required answer has no flag equivalent).';

	static override enableJsonFlag = true;

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-agent-setup';

	static override examples = [
		{
			description: 'Auto-detect all installed agents and configure them.',
			command: 'apify agent setup',
		},
		{
			description: 'Configure Claude Code without a confirmation prompt.',
			command: 'apify agent setup --client claude-code --yes',
		},
		{
			description: 'Non-interactive setup from a CI script.',
			command: 'apify agent setup --yes --json',
		},
	];

	static override flags = {
		...YesFlag('Skip the confirmation prompt and apply immediately.'),
		client: Flags.string({
			description: `Target a specific client instead of auto-detecting. One of: ${SUPPORTED_CLIENTS.join(', ')}.`,
		}),
	};

	async run() {
		const { yes, client: clientFlag, json } = this.flags;
		const mcpUrl = buildSetupMcpUrl();

		// ── Step 1: Determine candidate clients ───────────────────────────
		let candidates: ClientName[];
		if (clientFlag) {
			if (!isSupportedClient(clientFlag)) {
				error({
					message: `Unknown client '${clientFlag}'. Supported: ${SUPPORTED_CLIENTS.join(', ')}.`,
				});
				process.exitCode = CommandExitCodes.InvalidInput;
				return;
			}
			candidates = [clientFlag];
		} else {
			candidates = await detectClients();
			if (candidates.length === 0) {
				simpleLog({
					message: [
						'No supported AI coding agents detected on this machine.',
						`Supported clients: ${SUPPORTED_CLIENTS.join(', ')}.`,
						`To target a specific client, re-run with --client <name>.`,
					].join('\n'),
				});
				if (json) printJsonToStdout({ clients: [] });
				return;
			}
		}

		// ── Step 2: Idempotency — split into already-configured vs new ─────
		const existingState = await readAgentState();
		const alreadyConfigured: ClientName[] = [];
		const toInstall: ClientName[] = [];

		for (const client of candidates) {
			if (existingState && isClientConfigured(existingState, client)) {
				alreadyConfigured.push(client);
			} else {
				toInstall.push(client);
			}
		}

		const alreadyResults: SetupResult[] = alreadyConfigured.map((client) => {
			const entry = getClientEntry(client);
			return {
				client,
				tier: entry ? effectiveTier(entry) : 'mcp',
				outcome: 'already_configured',
			};
		});

		if (toInstall.length === 0) {
			simpleLog({
				message: 'All detected agents are already configured. Nothing to do.',
			});
			if (json) printJsonToStdout({ clients: alreadyResults });
			return;
		}

		// ── Step 3: Resolve auth once for all clients that need a token ────
		const auth = await resolveAuth();

		const allRequireToken = toInstall.every((c) => clientNeedsToken(c));
		if (allRequireToken && !auth) {
			error({
				message: `You are not logged in to Apify. Run 'apify login' first, or set APIFY_TOKEN.`,
			});
			process.exitCode = CommandExitCodes.MissingAuth;
			return;
		}

		// ── Step 4: Show plan, confirm once ───────────────────────────────
		const planLines = toInstall.map((client) => {
			const entry = getClientEntry(client);
			const tier = entry ? effectiveTier(entry) : 'mcp';
			return `  ${chalk.bold(client)}  [${tier} tier]`;
		});

		simpleLog({
			message: [
				`\nWill configure Apify MCP for ${toInstall.length} agent${toInstall.length === 1 ? '' : 's'}:`,
				...planLines,
				`\n  MCP URL: ${mcpUrl}`,
			].join('\n'),
		});

		if (alreadyConfigured.length > 0) {
			simpleLog({
				message: `\nAlready configured (no changes): ${alreadyConfigured.join(', ')}`,
			});
		}

		const confirmed = await useYesNoConfirm({
			message: `Apply the configuration above?`,
			default: false,
			providedConfirmFromStdin: yes || undefined,
			errorMessageForStdin: `Re-run with --yes to skip this prompt.`,
		});

		if (!confirmed) {
			simpleLog({ message: 'Aborted. No changes were made.' });
			if (json) printJsonToStdout({ clients: alreadyResults });
			return;
		}

		// ── Step 5: Apply per client ───────────────────────────────────────
		const token = auth?.token ?? '';
		const installResults: SetupResult[] = [];
		let anyFailed = false;

		for (const client of toInstall) {
			const entry = getClientEntry(client);
			if (!entry) {
				error({
					message: `Skipping '${client}': not found in catalog.`,
				});
				installResults.push({
					client,
					tier: 'mcp',
					outcome: 'failed',
					reason: 'not-in-catalog',
				});
				anyFailed = true;
				continue;
			}

			if (clientNeedsToken(client) && !auth) {
				error({
					message: `Skipping '${client}': Apify token required. Run 'apify login' first.`,
				});
				installResults.push({
					client,
					tier: effectiveTier(entry),
					outcome: 'failed',
					reason: 'no-auth',
				});
				anyFailed = true;
				continue;
			}

			// Some handlers (runCliInstall) signal failure via process.exitCode without throwing.
			// Clear it before each client so we can detect a handler-set failure afterwards.
			process.exitCode = undefined;
			try {
				await applyForClient(client, entry, mcpUrl, token);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				error({
					message: `Failed to configure '${client}': ${message}`,
				});
				installResults.push({
					client,
					tier: effectiveTier(entry),
					outcome: 'failed',
					reason: message,
				});
				anyFailed = true;
				process.exitCode = undefined;
				continue;
			}

			if (process.exitCode !== undefined) {
				// Handler set exitCode (e.g. binary not found) — treat as failure.
				installResults.push({
					client,
					tier: effectiveTier(entry),
					outcome: 'failed',
					reason: `exit ${String(process.exitCode)}`,
				});
				anyFailed = true;
				process.exitCode = undefined;
			} else {
				installResults.push({
					client,
					tier: effectiveTier(entry),
					outcome: 'installed',
				});
			}
		}

		if (anyFailed) {
			process.exitCode = CommandExitCodes.RunFailed;
		}

		// ── Step 6: Write state for newly installed clients ────────────────
		const justInstalled = installResults.filter((r) => r.outcome === 'installed');
		if (justInstalled.length > 0) {
			const now = new Date().toISOString();
			const newState: AgentState = existingState ?? {
				installedAt: now,
				clients: [],
			};
			if (!existingState) newState.installedAt = now;

			for (const r of justInstalled) {
				// Replace an existing entry if present (shouldn't happen given idempotency check, but safe)
				const idx = newState.clients.findIndex((e) => e.client === r.client);
				const record = {
					client: r.client,
					tier: r.tier,
					installedAt: now,
				};
				if (idx >= 0) {
					newState.clients[idx] = record;
				} else {
					newState.clients.push(record);
				}
			}

			await writeAgentState(newState);
		}

		// ── Step 7: Machine-readable output ───────────────────────────────
		if (json) {
			// Sort: alreadyConfigured first, then installResults (preserves candidate order within each group)
			const allResults = [...alreadyResults, ...installResults];
			// Re-sort by original candidate order
			const order = Object.fromEntries(candidates.map((c, i) => [c, i]));
			allResults.sort((a, b) => (order[a.client] ?? 0) - (order[b.client] ?? 0));

			printJsonToStdout({
				clients: allResults.map(({ reason: _reason, ...rest }) => rest),
			});
		}
	}
}
