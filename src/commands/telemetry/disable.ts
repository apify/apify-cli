import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { updateTelemetryEnabled, useTelemetryState } from '../../lib/hooks/telemetry/useTelemetryState.js';

export class TelemetryDisableCommand extends ApifyCommand<typeof TelemetryDisableCommand> {
	static override name = 'disable' as const;

	static override description = 'Disables telemetry.';

	async run() {
		const currentState = await useTelemetryState();

		if (currentState.enabled) {
			await updateTelemetryEnabled(false);

			this.logger.stderr.success('Telemetry disabled.');
		} else {
			this.logger.stderr.info('Telemetry is already disabled.');
		}
	}
}
