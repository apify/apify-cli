import { readFile } from 'node:fs/promises';
import process from 'node:process';

import axios from 'axios';
import chalk from 'chalk';
import { isCI } from 'ci-info';

import {
	APIFY_CLIENT_DEFAULT_HEADERS,
	AUTH_FILE_PATH,
	CHECK_RENTAL_ACTORS_EVERY_MILLIS,
	RENTAL_SUNSET_NOTICE_EVERY_MILLIS,
	RENTAL_SUNSET_NOTICE_UNTIL,
} from '../consts.js';
import { simpleLog, warning } from '../outputs.js';
import type { AuthJSON } from '../types.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { useCLIMetadata } from './useCLIMetadata.js';
import { type LatestState, updateLocalState, useLocalState } from './useLocalState.js';

const RENTAL_PRICING_MODEL = 'FLAT_PRICE_PER_MONTH';

const DEFAULT_API_BASE_URL = 'https://api.apify.com';

/** The notice runs after the command the user actually asked for, so the lookup gets one short attempt. */
const STORE_LOOKUP_TIMEOUT_MILLIS = 3_000;

const APIFY_DISCORD_URL = 'https://discord.gg/crawlee-apify-801163717915574323';

export interface RentalSunsetGateInput {
	now: number;
	isCi: boolean;
	skipEnvValue?: string;
}

/**
 * Decides whether the rental sunset notice should be suppressed. Kept pure so the gating rules can
 * be tested without touching the network or the local state file.
 */
export function shouldSkipRentalSunsetNotice({ now, isCi, skipEnvValue }: RentalSunsetGateInput) {
	if (skipEnvValue && !['0', 'false'].includes(skipEnvValue)) {
		return true;
	}

	// The notice is aimed at a human reading their terminal, printing it into CI logs is just noise.
	if (isCi) {
		return true;
	}

	if (now >= RENTAL_SUNSET_NOTICE_UNTIL) {
		return true;
	}

	return false;
}

/**
 * The daily throttle is per account - logging in as somebody else must not inherit the previous
 * user's "already warned today" timestamp.
 */
export function wasNotifiedRecently(cached: LatestState['rentalSunset'], username: string, now: number) {
	if (!cached?.lastNotifiedAt || cached.username !== username) {
		return false;
	}

	return now - cached.lastNotifiedAt < RENTAL_SUNSET_NOTICE_EVERY_MILLIS;
}

export function renderRentalSunsetNotice(rentalActorCount: number) {
	const actorWord = rentalActorCount === 1 ? 'rental Actor' : 'rental Actors';

	return [
		chalk.bold('Rental model sunset'),
		'',
		`You have ${rentalActorCount} ${actorWord} published in Apify Store. Apify is sunsetting the rental pricing model.`,
		'',
		`  ${chalk.bold('April 1, 2026')}     Publishing new rental Actors and pricing changes on existing ones were disabled.`,
		`  ${chalk.bold('October 1, 2026')}   Rental Actors are fully retired. All remaining Actors move to pay-per-usage pricing.`,
		'',
		`For more information, visit the ${chalk.cyan('#project-rentals')} channel on Apify Discord:`,
		`  ${chalk.cyan(APIFY_DISCORD_URL)}`,
		'',
		chalk.dim('To silence this notice, set APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE=1.'),
		'',
	].join('\n');
}

/**
 * Reads the logged in username straight from auth.json instead of going through `getLocalUserInfo`,
 * which resolves the token from the OS keyring and would trigger a keychain prompt on commands that
 * do not need authentication at all.
 */
async function getLocalUsername() {
	try {
		const raw = await readFile(AUTH_FILE_PATH(), 'utf-8');

		return (JSON.parse(raw) as AuthJSON).username;
	} catch {
		return undefined;
	}
}

/**
 * Returns `null` for every kind of failed lookup - a refused or timed out request, a non-2xx status,
 * or a 200 that is not a Store response. Callers need "we could not find out" to be a value rather
 * than an exception, so that a stale count can still be used and the failure can still be cached.
 */
async function fetchRentalActorCount(username: string) {
	const metadata = useCLIMetadata();

	const url = new URL('/v2/store', process.env.APIFY_CLIENT_BASE_URL || DEFAULT_API_BASE_URL);

	try {
		// axios rather than `fetch`, so the lookup honors HTTP_PROXY/HTTPS_PROXY/NO_PROXY like every
		// other request the CLI makes - Node's global fetch ignores them.
		const { data } = await axios.get<{ data?: { total?: number } }>(url.href, {
			params: {
				username,
				pricingModel: RENTAL_PRICING_MODEL,
				// We only need the `total`, not the Actors themselves.
				limit: 1,
			},
			timeout: STORE_LOOKUP_TIMEOUT_MILLIS,
			headers: {
				// Same origin headers every other CLI request to the Apify API carries, so this lookup is
				// attributed like the rest of the CLI rather than as anonymous traffic.
				...APIFY_CLIENT_DEFAULT_HEADERS,
				'User-Agent': `Apify CLI/${metadata.version} (https://github.com/apify/apify-cli)`,
			},
		});

		// A 200 without a numeric `total` means something other than the Store answered (a captive
		// portal, a proxy interstitial, a schema change). Treating it as zero would cache the notice away.
		if (typeof data?.data?.total !== 'number') {
			cliDebugPrint('useRentalSunsetNotice', 'Store response has no data.total', { body: data });

			return null;
		}

		return data.data.total;
	} catch (err) {
		// Covers a refused or timed out request and, since axios rejects non-2xx by default, HTTP errors.
		cliDebugPrint('useRentalSunsetNotice', 'Failed to look up rental Actors', err);

		return null;
	}
}

interface ResolvedRentalActorCount {
	rentalActorCount: number;
	/** When the Store was last actually queried. Carried over unchanged on a cache hit. */
	lastChecked: number;
	/** True when no request was made, so there is nothing new to persist. */
	fromCache: boolean;
}

async function resolveRentalActorCount(
	cached: LatestState['rentalSunset'],
	username: string,
	now: number,
): Promise<ResolvedRentalActorCount> {
	const cachedForUser = cached?.username === username ? cached : undefined;

	if (cachedForUser && now - cachedForUser.lastChecked < CHECK_RENTAL_ACTORS_EVERY_MILLIS) {
		return {
			rentalActorCount: cachedForUser.rentalActorCount,
			lastChecked: cachedForUser.lastChecked,
			fromCache: true,
		};
	}

	const fetched = await fetchRentalActorCount(username);

	// A failed lookup still counts as checked. Without that, every command would retry - and a
	// connection that hangs instead of refusing costs the full request timeout each time.
	return {
		rentalActorCount: fetched ?? cachedForUser?.rentalActorCount ?? 0,
		lastChecked: now,
		fromCache: false,
	};
}

/**
 * Warns users who publish rental Actors in Apify Store that the rental pricing model is going away.
 * Runs after every command, but only prints once a day and only checks the API once a day.
 *
 * Never throws - a broken notice must not break the command the user actually asked for.
 */
export async function useRentalSunsetNotice() {
	try {
		const now = Date.now();
		const state = useLocalState();

		if (
			shouldSkipRentalSunsetNotice({
				now,
				isCi: isCI,
				skipEnvValue: process.env.APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE,
			})
		) {
			return;
		}

		const username = await getLocalUsername();

		if (!username) {
			cliDebugPrint('useRentalSunsetNotice', 'Not logged in, skipping the check');

			return;
		}

		if (wasNotifiedRecently(state.rentalSunset, username, now)) {
			return;
		}

		const { rentalActorCount, lastChecked, fromCache } = await resolveRentalActorCount(
			state.rentalSunset,
			username,
			now,
		);

		const shouldNotify = rentalActorCount > 0;

		// Nothing was fetched and nothing will be printed, so the state file is already up to date.
		if (fromCache && !shouldNotify) {
			return;
		}

		updateLocalState(state, (stateToUpdate) => {
			stateToUpdate.rentalSunset = {
				lastChecked,
				username,
				rentalActorCount,
				...(shouldNotify ? { lastNotifiedAt: now } : {}),
			};
		});

		if (!shouldNotify) {
			return;
		}

		simpleLog({ message: '' });
		warning({ message: renderRentalSunsetNotice(rentalActorCount) });
	} catch (err) {
		cliDebugPrint('useRentalSunsetNotice', 'Failed to run the rental sunset check', err);
	}
}
