import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { updateTelemetryEnabled, useTelemetryState } from '../../lib/hooks/telemetry/useTelemetryState.js';

import { TelemetryDisableCommandMessages } from '#i18n/commands/telemetry/disable.js';

export class TelemetryDisableCommand extends ApifyCommand<typeof TelemetryDisableCommand> {
	static override name = 'disable' as const;

	static override description = 'Disables telemetry.';

	static override examples = [
		{
			description: 'Opt out of anonymous telemetry.',
			command: 'apify telemetry disable',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/telemetry';

	async run() {
		const currentState = await useTelemetryState();

		if (currentState.enabled) {
			await updateTelemetryEnabled(false);

			this.logger.stderr.success(this.t(TelemetryDisableCommandMessages.disabled));
		} else {
			this.logger.stderr.info(this.t(TelemetryDisableCommandMessages.alreadyDisabled));
		}
	}
}
