import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AgentSetupCommand } from './setup.js';
import { AgentStatusCommand } from './status.js';
import { AgentUninstallCommand } from './uninstall.js';

export class AgentIndexCommand extends ApifyCommand<typeof AgentIndexCommand> {
	static override name = 'agent' as const;

	static override description =
		'Configure AI coding agents to use Apify tools via MCP. Detects installed clients and applies the best available integration tier.';

	static override group = 'Agent';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-agent';

	static override subcommands = [AgentSetupCommand, AgentStatusCommand, AgentUninstallCommand];

	async run() {
		this.printHelp();
	}
}
