import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

vitest.mock('ci-info', () => {
	const ciInfo = { isCI: false, GITHUB_ACTIONS: false, id: undefined };

	return { ...ciInfo, default: ciInfo };
});

const { default: axios } = await import('axios');
const { APIFY_CLIENT_DEFAULT_HEADERS, AUTH_FILE_PATH, RENTAL_SUNSET_NOTICE_UNTIL, STATE_FILE_PATH } =
	await import('../../../src/lib/consts.js');
const { renderRentalSunsetNotice, shouldSkipRentalSunsetNotice, useRentalSunsetNotice, wasNotifiedRecently } =
	await import('../../../src/lib/hooks/useRentalSunsetNotice.js');

const now = new Date('2026-05-01T00:00:00.000Z').getTime();
const day = 24 * 60 * 60 * 1000;

useAuthSetup();

const { logMessages } = useConsoleSpy();

async function writeAuthFile(username: string | undefined) {
	const path = AUTH_FILE_PATH();

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify({ id: 'user-id', username, token: 'apify_api_token' }));
}

interface StoredRentalSunset {
	lastChecked: number;
	username: string;
	rentalActorCount: number;
	lastNotifiedAt?: number;
}

async function readState() {
	return JSON.parse(await readFile(STATE_FILE_PATH(), 'utf-8')) as { rentalSunset?: StoredRentalSunset };
}

async function writeState(rentalSunset: StoredRentalSunset) {
	const path = STATE_FILE_PATH();

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify({ version: 1, rentalSunset }));
}

/** The hook looks the Store up through axios, so the spy goes on the same module instance it imports. */
function mockStoreResponse(total: number) {
	return vitest.spyOn(axios, 'get').mockResolvedValue({ data: { data: { total, count: total ? 1 : 0, items: [] } } });
}

/** A 200 whose body is not a Store response - a captive portal, a proxy interstitial, a schema change. */
function mockNonStoreResponse(body: unknown) {
	return vitest.spyOn(axios, 'get').mockResolvedValue({ data: body });
}

function mockRequestFailure() {
	return vitest.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 503'));
}

function requestConfig(spy: ReturnType<typeof mockStoreResponse>) {
	return spy.mock.calls[0][1] as { params: Record<string, unknown>; headers: Record<string, string> };
}

beforeEach(() => {
	// The suite-wide opt-out (see vitest.config.ts) keeps the rest of the tests from hitting the API,
	// but this file is the one place that actually exercises the notice.
	vitest.stubEnv('APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE', '');
	vitest.useFakeTimers({ toFake: ['Date'] });
	vitest.setSystemTime(now);
});

afterEach(() => {
	vitest.useRealTimers();
	vitest.restoreAllMocks();
});

describe('shouldSkipRentalSunsetNotice', () => {
	it('does not skip for a regular interactive run', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false })).toBe(false);
	});

	it('skips only when the opt-out env var is truthy', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: '1' })).toBe(true);
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: 'false' })).toBe(false);
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: '0' })).toBe(false);
	});

	it('skips in CI', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: true })).toBe(true);
	});

	it('skips once rental Actors are retired', () => {
		expect(shouldSkipRentalSunsetNotice({ now: RENTAL_SUNSET_NOTICE_UNTIL, isCi: false })).toBe(true);
	});
});

describe('wasNotifiedRecently', () => {
	const cached = { lastChecked: now, username: 'some-user', rentalActorCount: 2 };

	it('is true within a day of the last notice', () => {
		expect(wasNotifiedRecently({ ...cached, lastNotifiedAt: now - 1000 }, 'some-user', now)).toBe(true);
		expect(wasNotifiedRecently({ ...cached, lastNotifiedAt: now - day - 1000 }, 'some-user', now)).toBe(false);
	});

	it('is false with no state at all, and when nobody was notified yet', () => {
		expect(wasNotifiedRecently(undefined, 'some-user', now)).toBe(false);
		expect(wasNotifiedRecently(cached, 'some-user', now)).toBe(false);
	});

	it('does not let one account suppress the notice for another', () => {
		expect(wasNotifiedRecently({ ...cached, lastNotifiedAt: now - 1000 }, 'other-user', now)).toBe(false);
	});
});

describe('renderRentalSunsetNotice', () => {
	it('mentions both milestones and where to ask questions', () => {
		const message = renderRentalSunsetNotice(3);

		expect(message).toContain('You have 3 rental Actors published in Apify Store');
		expect(message).toContain('April 1, 2026');
		expect(message).toContain('October 1, 2026');
		expect(message).toContain('#project-rentals');
	});

	it('links the pay-per-event migration guide', () => {
		expect(renderRentalSunsetNotice(3)).toContain('https://blog.apify.com/migrating-to-pay-per-event-pricing/');
	});

	it('says how to silence itself', () => {
		expect(renderRentalSunsetNotice(3)).toContain('APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE=1');
	});

	it('uses singular wording for a single Actor', () => {
		expect(renderRentalSunsetNotice(1)).toContain('You have 1 rental Actor published');
	});
});

describe('useRentalSunsetNotice', () => {
	it('warns users who have rental Actors in the store and caches the result', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(1);

		expect(String(fetchSpy.mock.calls[0][0])).toContain('/v2/store');
		expect(requestConfig(fetchSpy).params).toMatchObject({
			username: 'some-user',
			pricingModel: 'FLAT_PRICE_PER_MONTH',
			limit: 1,
		});

		expect(logMessages.error.join('\n')).toContain('Rental model sunset');

		expect(await readState()).toMatchObject({
			rentalSunset: { username: 'some-user', rentalActorCount: 2, lastChecked: now, lastNotifiedAt: now },
		});
	});

	it('identifies itself the same way as the rest of the CLI', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();

		const { headers } = requestConfig(fetchSpy);
		expect(headers['X-Apify-Request-Origin']).toBe(APIFY_CLIENT_DEFAULT_HEADERS['X-Apify-Request-Origin']);
		expect(headers['User-Agent']).toContain('Apify CLI/');
	});

	it('stays quiet for users without rental Actors', async () => {
		await writeAuthFile('some-user');
		mockStoreResponse(0);

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('does not print again within a day, and does not hit the API either', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();
		logMessages.error = [];

		vitest.setSystemTime(now + day / 2);
		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('warns again a day later, re-checking the Store', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();
		logMessages.error = [];

		vitest.setSystemTime(now + day + 1000);
		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(logMessages.error.join('\n')).toContain('Rental model sunset');
	});

	it('does nothing when the user is not logged in', async () => {
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('stays quiet when the API call fails', async () => {
		await writeAuthFile('some-user');
		mockRequestFailure();

		await expect(useRentalSunsetNotice()).resolves.toBeUndefined();

		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('does not retry a failing lookup on every command', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockRequestFailure();

		await useRentalSunsetNotice();
		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(await readState()).toMatchObject({ rentalSunset: { lastChecked: now, rentalActorCount: 0 } });
	});

	it('keeps warning from the cached count while the API is down', async () => {
		await writeState({ lastChecked: now - day - 1000, username: 'some-user', rentalActorCount: 2 });
		await writeAuthFile('some-user');
		mockRequestFailure();

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).toContain('You have 2 rental Actors');
	});

	it('ignores a non-2xx response instead of caching a zero', async () => {
		await writeState({ lastChecked: now - day - 1000, username: 'some-user', rentalActorCount: 2 });
		await writeAuthFile('some-user');
		mockRequestFailure();

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).toContain('You have 2 rental Actors');
	});

	it('ignores a 200 that is not a Store response instead of caching a zero', async () => {
		await writeState({ lastChecked: now - day - 1000, username: 'some-user', rentalActorCount: 2 });
		await writeAuthFile('some-user');
		mockNonStoreResponse('<html>captive portal</html>');

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).toContain('You have 2 rental Actors');
	});

	it('does not let one account suppress the notice for the next one', async () => {
		await writeState({ lastChecked: now, username: 'first-user', rentalActorCount: 2, lastNotifiedAt: now });
		await writeAuthFile('second-user');
		mockStoreResponse(5);

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).toContain('You have 5 rental Actors');
		expect(await readState()).toMatchObject({
			rentalSunset: { username: 'second-user', rentalActorCount: 5, lastNotifiedAt: now },
		});
	});

	it('does not rewrite the state file on a quiet cache hit', async () => {
		await writeState({ lastChecked: now, username: 'some-user', rentalActorCount: 0 });
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(0);

		const before = await readFile(STATE_FILE_PATH(), 'utf-8');
		await useRentalSunsetNotice();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await readFile(STATE_FILE_PATH(), 'utf-8')).toBe(before);
	});
});
