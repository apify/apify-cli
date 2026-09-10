import type { ApifyClient } from 'apify-client';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';

/**
 * Whether the client talks to something other than the Apify cloud API - the only case in which it can be
 * a local Actor runtime. Runtime-only calls are skipped without a request otherwise.
 */
export function mayTargetActorRuntime(client: Pick<ApifyClient, 'baseUrl'>): boolean {
	try {
		const { hostname } = new URL(client.baseUrl);
		return hostname !== 'apify.com' && !hostname.endsWith('.apify.com');
	} catch {
		return false;
	}
}

/**
 * `POST /actor-runtime/dev-folder/:actorId` - registers `path` as the Actor's live dev folder on a local
 * Actor runtime. On failure, `error` carries the runtime's reason; it is absent when the target has no such
 * endpoint at all (not an Actor runtime), which is not worth reporting.
 */
export async function registerActorRuntimeDevFolder(
	client: Pick<ApifyClient, 'baseUrl' | 'token'>,
	actorId: string,
	path: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
	try {
		// `baseUrl` already ends in `/v2`; the runtime serves `/v2/actor-runtime/*` as an alias of `/actor-runtime/*`.
		const response = await fetch(`${client.baseUrl}/actor-runtime/dev-folder/${actorId}`, {
			method: 'POST',
			headers: {
				...APIFY_CLIENT_DEFAULT_HEADERS,
				'Authorization': `Bearer ${client.token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(path),
		});

		if (response.ok) return { ok: true };
		if (response.status === 404) return { ok: false };

		const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
		return { ok: false, error: payload?.error?.message ?? `${response.status} ${response.statusText}` };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}
