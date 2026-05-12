import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { updateTelemetryEnabled, useTelemetryState } from '../../lib/hooks/telemetry/useTelemetryState.js';

import { TelemetryEnableCommandMessages } from '#i18n/commands/telemetry/enable.js';

export class TelemetryEnableCommand extends ApifyCommand<typeof TelemetryEnableCommand> {
	static override name = 'enable' as const;

	static override description = 'Enables telemetry.';

	static override examples = [
		{
			description: 'Opt in to anonymous telemetry.',
			command: 'apify telemetry enable',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/telemetry';

	async run() {
		const currentState = await useTelemetryState();

		if (currentState.enabled) {
			this.logger.stderr.info(this.t(TelemetryEnableCommandMessages.alreadyEnabled));
		} else {
			await updateTelemetryEnabled(true);

			this.logger.stderr.success(this.t(TelemetryEnableCommandMessages.enabled));
		}
	}
}
