import process from 'node:process';

import { lookUpProfile } from '../../lib/auth-file.js';
import { type ResolvedAuth, resolveAuth } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { getConsoleIntegrationsUrl } from '../../lib/console-url.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { clientNeedsToken, getClientHandler, isSupportedClient, SUPPORTED_CLIENTS } from '../../lib/mcp/clients.js';
import { buildMcpUrl, DEFAULT_MCP_URL } from '../../lib/mcp/url.js';
import { error, simpleLog, warning } from '../../lib/outputs.js';

/** How long the token has left, as a clause that follows the token it describes. */
function describeExpiry(remainingMs: number): string {
	if (!Number.isFinite(remainingMs)) return 'expires within the hour';
	// A refresh that could not reach the token endpoint hands back the stored token, which by then
	// may have minutes or seconds left — never round that down to a reassuring "0 minutes".
	if (remainingMs <= 0) return 'has already expired';

	const minutes = Math.round(remainingMs / 60_000);
	if (minutes < 1) return 'expires in under a minute';

	return `expires in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * The token this command writes into a client's config is a copy: nothing refreshes it there. An
 * OAuth login's access token expires after about an hour, so the install silently stops working
 * unless the user passes a long-lived API token instead.
 *
 * Returns false when the user declines, in which case nothing should be written.
 */
async function confirmExpiringToken(auth: ResolvedAuth, yes: boolean): Promise<boolean> {
	if (!auth.profile) return true;

	const { profile } = lookUpProfile(auth.profile.id);
	if (profile?.authMethod !== 'oauth2' || !profile.expiresAt) return true;

	const expiry = describeExpiry(Date.parse(profile.expiresAt) - Date.now());
	// The Console account the token has to be created under: a bare URL would act on whatever
	// account the browser was last on, which for an organization login is the wrong one.
	const tokensUrl = getConsoleIntegrationsUrl({
		id: auth.profile.id,
		organizationOwnerUserId: profile.organizationOwnerUserId,
	});

	warning({
		message:
			`You're logged in through your Apify account, and that login's API token ${expiry}. ` +
			`The MCP client reads the token from its config file and can't refresh it, so the server stops working once the token expires.\n` +
			`Pass --token with an API token from Apify Console (${tokensUrl}) to configure a client that keeps working.`,
	});

	// `--yes` has to answer this prompt even on a TTY, where `useYesNoConfirm` would otherwise ask anyway.
	if (yes) return true;

	return useYesNoConfirm({
		message: 'Write the expiring token to the client config anyway?',
		default: false,
		errorMessageForStdin: `The token from 'apify login' ${expiry}. Re-run with --token <api-token>, or with --yes to write the expiring token anyway.`,
	});
}

export class MCPInstallCommand extends ApifyCommand<typeof MCPInstallCommand> {
	static override name = 'install' as const;

	static override description = `Configure a local MCP client to use the Apify MCP server. Writes or merges a server entry named 'apify' into the client's config file, or runs the client's own 'mcp add' command when available.`;

	static override group = 'MCP';

	static override interactive = true;

	static override interactiveNote =
		'Prompts before overwriting an existing JSON config entry (cursor, kiro, antigravity), and before writing a token that expires within the hour. Pass --yes to confirm without prompting. For clients delegated to their own CLI (claude-code, vscode, vscode-insiders, codex), overwrite behavior is controlled by that CLI.';

	static override examples = [
		{
			description: 'Add Apify to Claude Code using the stored API token.',
			command: 'apify mcp install claude-code',
		},
		{
			description: 'Add Apify to Cursor.',
			command: 'apify mcp install cursor',
		},
		{
			description: `Add only the 'search-actors' tool and the 'apify/rag-web-browser' Actor to VS Code.`,
			command: 'apify mcp install vscode --tools search-actors,apify/rag-web-browser',
		},
		{
			description: 'Add Apify to Codex CLI with an explicit token (non-interactive).',
			command: 'apify mcp install codex --token apify_api_xxxxx --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-mcp-install';

	static override args = {
		client: Args.string({
			required: true,
			description: `Target MCP client. One of: ${SUPPORTED_CLIENTS.join(', ')}.`,
		}),
	};

	static override flags = {
		...YesFlag(
			`Answer the confirmation prompts with yes: overwrite an existing 'apify' entry, and write a token that's about to expire.`,
		),
		token: Flags.string({
			char: 't',
			description: `Apify API token to embed in the config. Defaults to APIFY_TOKEN, then the token from 'apify login'. A token from an OAuth 'apify login' expires after about an hour, so pass a long-lived one from Apify Console.`,
		}),
		url: Flags.string({
			description: 'Apify MCP server URL.',
			default: DEFAULT_MCP_URL,
		}),
		tools: Flags.string({
			description: `Comma-separated tool IDs or Actor full names to expose. Forwarded as a '?tools=' query parameter.`,
		}),
	};

	async run() {
		const { client } = this.args;
		const { token: tokenFlag, url: baseUrl, tools, yes } = this.flags;

		if (!isSupportedClient(client)) {
			error({
				message: `Unknown MCP client '${client}'. Supported clients: ${SUPPORTED_CLIENTS.join(', ')}.`,
			});
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}

		let token = tokenFlag ?? '';
		if (clientNeedsToken(client) && !tokenFlag) {
			const auth = await resolveAuth();
			if (!auth) {
				error({
					message: `You are not logged in to Apify. Run 'apify login' first, or pass --token <api-token>.`,
				});
				process.exitCode = CommandExitCodes.MissingAuth;
				return;
			}

			if (!(await confirmExpiringToken(auth, yes))) {
				simpleLog({ message: 'No changes written.' });
				return;
			}

			token = auth.token;
		}

		await getClientHandler(client)({ url: buildMcpUrl(baseUrl, tools), token, yes });
	}
}
