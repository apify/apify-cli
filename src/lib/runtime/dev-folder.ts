import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';

/**
 * The local Actor runtime's "live dev folder": a host directory it bind-mounts over the built image's
 * working directory when a run starts, so local edits apply on the next `apify call` without a push.
 * Registration goes through the runtime's own `POST /actor-runtime/dev-folder/:actorId` endpoint, which
 * the Apify platform does not have - so everything here is only ever attempted when the CLI is pointed
 * somewhere other than the cloud API (`APIFY_CLIENT_BASE_URL`), and a `404` from that target simply
 * means "not an Actor runtime".
 */

const APIFY_CLOUD_API_DOMAIN = 'apify.com';

/** Query parameter for `POST .../actors/:actorId/runs` that makes the runtime start that one run from the built image alone. */
export const DEV_FOLDER_OFF_RUN_PARAMS = { devFolder: 'false' } as const;

type RuntimeClient = Pick<ApifyClient, 'baseUrl' | 'token'>;

/**
 * Whether the client talks to something other than the Apify cloud API - the only case in which it can
 * be a local Actor runtime. Against the cloud, runtime-only calls are skipped without a request.
 */
export function mayTargetActorRuntime(client: Pick<ApifyClient, 'baseUrl'>): boolean {
	try {
		const { hostname } = new URL(client.baseUrl);
		return hostname !== APIFY_CLOUD_API_DOMAIN && !hostname.endsWith(`.${APIFY_CLOUD_API_DOMAIN}`);
	} catch {
		return false;
	}
}

/**
 * The runtime accepts an absolute POSIX path that exists on the Docker host. Unix paths pass through
 * unchanged; a Windows drive path becomes the `/c/Users/...` form Docker Desktop resolves on the host.
 */
export function toActorRuntimeDevFolderPath(localPath: string, platform: NodeJS.Platform = process.platform): string {
	if (platform !== 'win32') return localPath;

	const forwardSlashed = localPath.replaceAll('\\', '/');
	const drive = /^([a-zA-Z]):\/(.*)$/.exec(forwardSlashed);
	if (!drive) return forwardSlashed;

	return `/${drive[1].toLowerCase()}/${drive[2]}`;
}

export type DevFolderResult =
	/** The runtime accepted the call; `localDevFolder` is what it now has registered (`null` after a clear). */
	| { kind: 'ok'; localDevFolder: string | null }
	/** The target answered `404`: it is not an Actor runtime, or one without this endpoint. */
	| { kind: 'unsupported' }
	/** The runtime refused the path (does not exist on the host, not a directory, Docker unreachable, ...). */
	| { kind: 'rejected'; message: string }
	/** The request itself failed. */
	| { kind: 'unreachable'; message: string };

/**
 * `POST /actor-runtime/dev-folder/:actorId` - registers `path` as the Actor's live dev folder, or clears
 * the registration when `path` is `null`. Never throws: every outcome is a `DevFolderResult`, so the
 * calling command decides what is worth telling the user.
 */
export async function setActorRuntimeDevFolder(
	client: RuntimeClient,
	actorId: string,
	path: string | null,
): Promise<DevFolderResult> {
	// `baseUrl` already ends in `/v2`; the runtime serves `/v2/actor-runtime/*` as an alias of `/actor-runtime/*`.
	const url = `${client.baseUrl}/actor-runtime/dev-folder/${actorId}`;
	const body = JSON.stringify(path ?? '');

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				...APIFY_CLIENT_DEFAULT_HEADERS,
				'Authorization': `Bearer ${client.token}`,
				'Content-Type': 'application/json',
			},
			body,
		});
	} catch (err) {
		cliDebugPrint('actor-runtime', 'POST', url, 'failed', err);
		return { kind: 'unreachable', message: (err as Error).message };
	}

	const text = await response.text();
	cliDebugPrint('actor-runtime', 'POST', url, body, '->', response.status, text.slice(0, 400));

	if (response.status === 404) return { kind: 'unsupported' };

	const payload = (() => {
		try {
			return JSON.parse(text) as { data?: { localDevFolder?: string | null }; error?: { message?: string } };
		} catch {
			return null;
		}
	})();

	if (!response.ok) {
		return { kind: 'rejected', message: payload?.error?.message ?? `${response.status} ${response.statusText}` };
	}

	return { kind: 'ok', localDevFolder: payload?.data?.localDevFolder ?? null };
}
