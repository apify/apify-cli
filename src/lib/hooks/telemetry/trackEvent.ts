import { USER_AGENT } from '../../../entrypoints/_shared.js';
import { cliDebugPrint } from '../../utils/cliDebugPrint.js';
import type { InstallMethod } from '../useCLIMetadata.js';
import { useCLIMetadata } from '../useCLIMetadata.js';
import { maskCredentialsDeep } from './credentialsInText.js';
import { useTelemetryEnabled } from './useTelemetryEnabled.js';
import { useTelemetryIdentifiers } from './useTelemetryIdentifiers.js';

const metadata = useCLIMetadata();

// If we ever move to the EU workspace, use https://events.eu1.segmentapis.com/v1 instead
const SEGMENT_API_URL = 'https://api.segment.io/v1/track';

const SEGMENT_WRITE_KEY = metadata.isBeta ? 'rT67mFpIQD5qS9bJBoIYSFbZucrt2DZC' : '2uPK6yhPqjC0eNUFhaY78S26cRKyaa6t';

interface CliCommandEvent {
	installMethod: InstallMethod;
	osArch: typeof process.arch;
	runtime: typeof metadata.runtime.runtime;
	runtimeVersion: typeof metadata.runtime.version;
	runtimeNodeVersion: typeof metadata.runtime.nodeVersion;

	commandString: string;
	entrypoint: string;

	flagsUsed: string[];

	actorLanguage?: 'javascript' | 'python';
	actorRuntime?: string;
	actorRuntimeVersion?: string;

	create?: {
		fromArchiveUrl?: boolean;
		templateId?: string;
		templateName?: string;
		templateLanguage?: string;
		origin?: 'console' | 'cli';
		/** Where the Actor's source code lives — 'apify' or a Git provider. */
		source?: string;
	};

	push?: {
		actorId?: string;
		wasCreated?: boolean;
	};

	/** A push from a directory without an Actor of its own: how many Actors were chosen and how many failed. */
	pushSelection?: {
		selected: number;
		failed: number;
	};

	login?: {
		method: 'oauth2-device' | 'oauth2-code' | 'console' | 'manual' | 'token';
		/** Set when the device code flow could not run and the authorization code flow took over. */
		fellBackFrom?: 'oauth2-device';
	};

	// init command
	actorWrapper?: string;

	// execution context
	exitCode?: number;
	durationMs?: number;
	aiAgent?: string;
	userAgent?: string;
	isCi?: boolean;
	ciProvider?: string;
	isInteractive?: boolean;
	wasRetried?: boolean;
}

/** Sent by `apify feedback`. Property names mirror the MCP server's `buildReportedProblemProperties`. */
interface CliReportedProblemEvent {
	message: string;
	actor_id?: string;
	actor_run_id?: string;
	sentiment?: 'positive' | 'negative' | 'neutral';
	category?: 'bug' | 'spec_mismatch' | 'readme_unclear' | 'missing_capability' | 'improvement' | 'worked_well';
	source?: 'user' | 'model';
	expected?: string;
	actual?: string;
	app_version: string;
	os: string;
	os_arch: string;
	install_method: InstallMethod;
	last_command?: string;
	last_command_exit_code?: number;
	sent_by: 'human' | 'agent';
	ai_agent?: string;
}

export interface TrackEventMap {
	'cli_command': CliCommandEvent;
	'CLI Reported Problem': CliReportedProblemEvent;
}

/**
 * Sends the event to Segment whether or not telemetry is enabled, so only call it directly for
 * something the user explicitly asked to send. Resolves to whether Segment accepted the event; never throws.
 */
export async function sendEvent<Event extends keyof TrackEventMap>(
	event: Event,
	eventData: TrackEventMap[Event],
): Promise<boolean> {
	try {
		const identifiers = await useTelemetryIdentifiers();

		const segmentPayload = {
			anonymousId: identifiers.anonymousId,
			context: {
				app: {
					name: 'apify-cli',
					version: metadata.version,
					build: metadata.hash,
				},
				library: {
					name: 'apify-cli',
					version: metadata.version,
				},
				os: {
					name: metadata.platform,
				},
				userAgent: USER_AGENT,
				channel: 'server',
			},
			event,
			// The last line of defence: no event leaves with a recognisable credential, whatever built it.
			properties: maskCredentialsDeep({
				...eventData,
				app: 'cli',
			}),
			timestamp: new Date().toISOString(),
			userId: identifiers.userId,

			// write key
			writeKey: SEGMENT_WRITE_KEY,
		};

		cliDebugPrint('trackEvent', segmentPayload);

		const res = await fetch(SEGMENT_API_URL, {
			method: 'POST',
			body: JSON.stringify(segmentPayload),
		});

		if (!res.ok) {
			cliDebugPrint('trackEvent', 'failed to send event', await res.text());
			return false;
		}

		cliDebugPrint('trackEvent', 'event sent');
		return true;
	} catch (error) {
		cliDebugPrint('trackEvent', 'failed to send event', error);
		return false;
	}
}

export async function trackEvent<Event extends keyof TrackEventMap>(event: Event, eventData: TrackEventMap[Event]) {
	// An unreadable state file means no telemetry, not a failed command.
	const telemetryEnabled = await useTelemetryEnabled().catch(() => false);

	if (!telemetryEnabled) {
		cliDebugPrint('trackEvent', 'telemetry disabled');
		return;
	}

	await sendEvent(event, eventData);
}
