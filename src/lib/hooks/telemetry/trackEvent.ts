import { USER_AGENT } from '../../../entrypoints/_shared.js';
import { cliDebugPrint } from '../../utils/cliDebugPrint.js';
import { useCLIMetadata } from '../useCLIMetadata.js';
import { useTelemetryEnabled } from './useTelemetryEnabled.js';
import { useTelemetryIdentifiers } from './useTelemetryIdentifiers.js';

const metadata = useCLIMetadata();

// If we ever move to the EU workspace, use https://events.eu1.segmentapis.com/v1 instead
const SEGMENT_API_URL = 'https://api.segment.io/v1/track';

const SEGMENT_WRITE_KEY = metadata.isBeta ? 'rT67mFpIQD5qS9bJBoIYSFbZucrt2DZC' : '2uPK6yhPqjC0eNUFhaY78S26cRKyaa6t';

export interface TrackEventInput {
	eventName: string;
	eventData: Record<string, unknown>;
}

export async function trackEvent({ eventName, eventData }: TrackEventInput) {
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
		event: eventName,
		properties: {
			...eventData,
			app: 'cli',
		},
		timestamp: new Date().toISOString(),
		userId: identifiers.userId,

		// write key
		writeKey: SEGMENT_WRITE_KEY,
	};

	cliDebugPrint('trackEvent', segmentPayload);
	const telemetryEnabled = await useTelemetryEnabled();

	if (!telemetryEnabled) {
		cliDebugPrint('trackEvent', 'telemetry disabled');
		return;
	}

	const res = await fetch(SEGMENT_API_URL, {
		method: 'POST',
		body: JSON.stringify(segmentPayload),
	});

	if (!res.ok) {
		cliDebugPrint('trackEvent', 'failed to send event', await res.text());
		return;
	}

	cliDebugPrint('trackEvent', 'event sent');
}
