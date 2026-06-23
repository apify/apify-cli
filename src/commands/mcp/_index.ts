import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { MCPInstallCommand } from './install.js';

export class MCPIndexCommand extends ApifyCommand<typeof MCPIndexCommand> {
	static override name = 'mcp' as const;

	static override description = `Configure the Apify MCP server in your AI client: Claude Code, Cursor, VS Code, Codex CLI, Kiro, or Antigravity.`;

	static override group = 'MCP';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-mcp';

	static override subcommands = [MCPInstallCommand];

	async run() {
		this.printHelp();
	}
}
