import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TelemetryDisableCommand } from './disable.js';
import { TelemetryEnableCommand } from './enable.js';

export class TelemetryIndexCommand extends ApifyCommand<typeof TelemetryIndexCommand> {
	static override name = 'telemetry' as const;

	static override description =
		'Manages telemetry settings. We use this data to improve the CLI and the Apify platform.\nRead more: https://docs.apify.com/cli/docs/telemetry';

	static override subcommands = [TelemetryEnableCommand, TelemetryDisableCommand];

	async run() {
		this.printHelp();
	}
}
