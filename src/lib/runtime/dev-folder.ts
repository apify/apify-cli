import process from 'node:process';

import type { ApifyClient } from 'apify-client';
import chalk from 'chalk';

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
	/** The runtime answered; `localDevFolder` is what it has registered for the Actor (`null` when nothing). */
	| { kind: 'ok'; localDevFolder: string | null }
	/** The target answered `404`: it is not an Actor runtime, or one without this endpoint. */
	| { kind: 'unsupported' }
	/** The runtime refused the request (a path that does not exist on the host, is not a directory, Docker unreachable, ...). */
	| { kind: 'rejected'; message: string }
	/** The request itself failed. */
	| { kind: 'unreachable'; message: string };

/**
 * `GET /actor-runtime/dev-folder/:actorId` - reads what the runtime has registered for the Actor without
 * changing it. Never throws.
 */
export async function getActorRuntimeDevFolder(client: RuntimeClient, actorId: string): Promise<DevFolderResult> {
	return devFolderRequest(client, actorId, 'GET');
}

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
	return devFolderRequest(client, actorId, 'POST', JSON.stringify(path ?? ''));
}

async function devFolderRequest(
	client: RuntimeClient,
	actorId: string,
	method: 'GET' | 'POST',
	body?: string,
): Promise<DevFolderResult> {
	// `baseUrl` already ends in `/v2`; the runtime serves `/v2/actor-runtime/*` as an alias of `/actor-runtime/*`.
	const url = `${client.baseUrl}/actor-runtime/dev-folder/${actorId}`;

	let response: Response;
	try {
		const headers = { ...APIFY_CLIENT_DEFAULT_HEADERS, Authorization: `Bearer ${client.token}` };
		response = await fetch(
			url,
			body === undefined
				? { method, headers }
				: { method, headers: { ...headers, 'Content-Type': 'application/json' }, body },
		);
	} catch (err) {
		cliDebugPrint('actor-runtime', method, url, 'failed', err);
		return { kind: 'unreachable', message: (err as Error).message };
	}

	const text = await response.text();
	cliDebugPrint('actor-runtime', method, url, body ?? '', '->', response.status, text.slice(0, 400));

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

/**
 * The banner `apify call` prints before a run that will mount a registered live dev folder - loud on
 * purpose: the mount also hides the image's compiled output, so an un-rebuilt TypeScript Actor fails
 * with a confusing "cannot find module dist/main.js" rather than running stale code.
 */
export function formatLiveDevFolderWarning(localDevFolder: string): string {
	const bar = '!'.repeat(96);
	const lines = [
		'',
		chalk.bgRed.white.bold(' LIVE DEV FOLDER MODE '),
		`This run uses the local source files from ${localDevFolder}, mounted over the built Docker image.`,
		'TS-based Actors require local compilation (e.g. `npm run build`) before the run.',
		'To run purely from the built Docker image, use `apify call --no-dev-folder`.',
		'',
	];
	return [bar, ...lines.map((line) => `!!  ${line}`), bar].map((line) => chalk.red.bold(line)).join('\n');
}
