import type { ApifyClient } from 'apify-client';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';

/** Anything but the Apify cloud API may be a local Actor runtime; runtime-only calls are skipped otherwise. */
export function mayTargetActorRuntime(client: Pick<ApifyClient, 'baseUrl'>): boolean {
	try {
		const { hostname } = new URL(client.baseUrl);
		return hostname !== 'apify.com' && !hostname.endsWith('.apify.com');
	} catch {
		return false;
	}
}

/** Registers `path` as the Actor's live dev folder. `error` is absent when the target has no such endpoint. */
export async function registerActorRuntimeDevFolder(
	client: Pick<ApifyClient, 'baseUrl' | 'token'>,
	actorId: string,
	path: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
	try {
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
