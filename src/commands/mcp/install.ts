import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { resolveApifyToken } from '../../lib/mcp/auth.js';
import { getClientHandler, isSupportedClient, SUPPORTED_CLIENTS } from '../../lib/mcp/clients.js';
import { buildMcpUrl, DEFAULT_MCP_URL } from '../../lib/mcp/url.js';
import { error } from '../../lib/outputs.js';

export class MCPInstallCommand extends ApifyCommand<typeof MCPInstallCommand> {
	static override name = 'install' as const;

	static override description = `Configure a local MCP client to use the Apify MCP server. Writes or merges a server entry named 'apify' into the client's config file, or runs the client's own 'mcp add' command when available.`;

	static override group = 'MCP';

	static override interactive = true;

	static override interactiveNote =
		'Prompts before overwriting an existing JSON config entry (cursor, kiro, antigravity). Pass --yes to overwrite without prompting. For clients delegated to their own CLI (claude-code, vscode, vscode-insiders, codex), overwrite behavior is controlled by that CLI.';

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
		...YesFlag(`Overwrite an existing 'apify' entry without prompting.`),
		token: Flags.string({
			char: 't',
			description: `Apify API token to embed in the config. Defaults to the token from 'apify login'.`,
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

		const token = await resolveApifyToken(tokenFlag);
		if (!token) return;

		await getClientHandler(client)({ url: buildMcpUrl(baseUrl, tools), token, yes });
	}
}
