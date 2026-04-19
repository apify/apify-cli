import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { updateTelemetryEnabled, useTelemetryState } from '../../lib/hooks/telemetry/useTelemetryState.js';

export class TelemetryEnableCommand extends ApifyCommand<typeof TelemetryEnableCommand> {
	static override name = 'enable' as const;

	static override description = 'Enables telemetry.';

	async run() {
		const currentState = await useTelemetryState();

		if (currentState.enabled) {
			this.logger.stderr.info('Telemetry is already enabled.');
		} else {
			await updateTelemetryEnabled(true);

			this.logger.stderr.success('Telemetry enabled.');
		}
	}
}
