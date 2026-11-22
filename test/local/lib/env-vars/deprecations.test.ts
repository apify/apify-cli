import { __resetDeprecationWarningsForTests, warnDeprecated } from '../../../../src/lib/env-vars/deprecations.js';
import type { TrackEventMap } from '../../../../src/lib/hooks/telemetry/trackEvent.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { logMessages } = useConsoleSpy();

const newTelemetry = () => ({}) as TrackEventMap['cli_command'];

describe('warnDeprecated', () => {
	beforeEach(() => {
		__resetDeprecationWarningsForTests();
	});

	it('prints the environmentVariables warning to stderr', () => {
		warnDeprecated('environmentVariables', newTelemetry());

		expect(logMessages.log).toEqual([]);
		expect(logMessages.error).toHaveLength(1);
		expect(logMessages.error[0]).toContain(
			'"environmentVariables" in .actor/actor.json is deprecated and will be removed in the next major version.',
		);
		expect(logMessages.error[0]).toContain('run apify env migrate');
	});

	it('prints the apify secrets warning to stderr', () => {
		warnDeprecated('secretsCommand', newTelemetry());

		expect(logMessages.log).toEqual([]);
		expect(logMessages.error).toHaveLength(1);
		expect(logMessages.error[0]).toContain(
			'apify secrets and "@secret" references are deprecated and will be removed in the next major version.',
		);
		expect(logMessages.error[0]).toContain('apify env set or apify env push');
	});

	it('prints each kind once per process', () => {
		warnDeprecated('secretsCommand', newTelemetry());
		warnDeprecated('secretsCommand', newTelemetry());
		warnDeprecated('environmentVariables', newTelemetry());
		warnDeprecated('environmentVariables', newTelemetry());

		expect(logMessages.error).toHaveLength(2);
	});

	it('records each kind once in telemetry', () => {
		const telemetry = newTelemetry();

		warnDeprecated('environmentVariables', telemetry);
		warnDeprecated('environmentVariables', telemetry);
		warnDeprecated('secretsCommand', telemetry);

		expect(telemetry.deprecationWarnings).toEqual(['environmentVariables', 'secretsCommand']);
	});

	it('records the kind even when the warning was already printed', () => {
		warnDeprecated('secretsCommand', newTelemetry());
		const telemetry = newTelemetry();

		warnDeprecated('secretsCommand', telemetry);

		expect(logMessages.error).toHaveLength(1);
		expect(telemetry.deprecationWarnings).toEqual(['secretsCommand']);
	});
});
