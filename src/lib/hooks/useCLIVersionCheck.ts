import { gt } from 'semver';

import { CHECK_VERSION_EVERY_MILLIS } from '../consts.js';
import { warning } from '../outputs.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { useCLIMetadata } from './useCLIMetadata.js';
import { type LatestState, updateLocalState, useLocalState } from './useLocalState.js';

const metadata = useCLIMetadata();

const USER_AGENT = `Apify CLI/${metadata.version} (https://github.com/apify/apify-cli)`;

const sitesToCheck = ['https://1.1.1.1', 'https://8.8.8.8'];

async function isOnline(timeout = 500) {
	const controller = new AbortController();

	const timeoutId = setTimeout(() => {
		controller.abort();
	}, timeout);

	const res = await Promise.any(
		sitesToCheck.map(async (site) =>
			fetch(site, {
				signal: controller.signal,
				headers: {
					'User-Agent': USER_AGENT,
				},
				keepalive: false,
			}),
		),
	).catch(() => null);

	if (!res) {
		cliDebugPrint('isOnline', { state: 'timeout' });

		return false;
	}

	if (res.ok) {
		clearTimeout(timeoutId);

		cliDebugPrint('isOnline', {
			state: 'online',
			site: res.url,
		});

		return true;
	}

	cliDebugPrint('isOnline', { state: 'offline' });

	return false;
}

async function getLatestVersion(state: LatestState) {
	const res = await fetch('https://api.github.com/repos/apify/apify-cli/releases/latest', {
		headers: {
			'User-Agent': USER_AGENT,
		},
	});

	if (!res.ok) {
		cliDebugPrint('useCLIVersionCheck', 'Failed to fetch latest version', {
			statusCode: res.status,
			body: await res.text(),
		});

		warning({ message: 'Failed to fetch latest version of Apify CLI, using the cached version instead.' });

		return null;
	}

	const body = (await res.json()) as { tag_name: string };

	const version = body.tag_name.replace(/^v/, '');

	cliDebugPrint('useCLIVersionCheck', 'Fetched latest version', { version });

	updateLocalState(state, (stateToUpdate) => {
		stateToUpdate.versionCheck = {
			lastChecked: Date.now(),
			lastVersion: version,
		};
	});

	return version;
}

export function shouldSkipVersionCheck() {
	if (process.env.APIFY_CLI_SKIP_UPDATE_CHECK && !['0', 'false'].includes(process.env.APIFY_CLI_SKIP_UPDATE_CHECK)) {
		return true;
	}

	return false;
}

export interface CLIVersionCheckResult {
	currentVersion: string;
	latestVersion: string;
	shouldUpdate: boolean;
	cacheHit: boolean;
}

export async function useCLIVersionCheck(force = false) {
	const localState = useLocalState();

	const stateIsOutdated =
		!localState.versionCheck || Date.now() - localState.versionCheck.lastChecked > CHECK_VERSION_EVERY_MILLIS;

	const shouldFetchFromApi = force || (stateIsOutdated && (await isOnline()));

	const latestVersion = shouldFetchFromApi
		? await getLatestVersion(localState)
		: localState.versionCheck?.lastVersion;

	if (!latestVersion) {
		return {
			currentVersion: metadata.version,
			latestVersion: 'unknown',
			shouldUpdate: false,
			cacheHit: false,
		};
	}

	const shouldUpdate = gt(latestVersion, metadata.version);

	return {
		currentVersion: metadata.version,
		latestVersion,
		shouldUpdate,
		cacheHit: !shouldFetchFromApi,
	};
}
