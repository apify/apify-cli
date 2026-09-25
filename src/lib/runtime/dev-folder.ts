import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { ApifyClient } from 'apify-client';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';

/** Node's own wording, CommonJS (`Cannot find module`, `MODULE_NOT_FOUND`) and ESM (`ERR_MODULE_NOT_FOUND`) alike. */
const MISSING_MODULE_PATTERN = /Cannot find module|MODULE_NOT_FOUND/;

/** Whether a piece of a run log reports a module Node could not load. */
export function mentionsMissingModule(logChunk: string): boolean {
	return MISSING_MODULE_PATTERN.test(logChunk);
}

/**
 * A TypeScript project that was never compiled locally: `tsconfig.json` is there, `dist/` (where the Apify
 * TypeScript templates compile to) is not. Mounted as the live dev folder, such a folder hides the compiled
 * output the Docker image built, so the run cannot find its entry module.
 */
export function looksLikeUncompiledTypeScriptActor(dir: string): boolean {
	if (!existsSync(join(dir, 'tsconfig.json'))) return false;

	try {
		return !statSync(join(dir, 'dist')).isDirectory();
	} catch {
		return true;
	}
}

/** Printed after a failed `apify call` whose log mentions a missing module, when `dir` looks uncompiled. */
export function uncompiledDevFolderHint(dir: string): string {
	return (
		`The run failed with a missing module, and ${dir} looks like a TypeScript Actor that was not compiled locally ` +
		`(it has a tsconfig.json but no dist/ directory). In live dev folder mode the run uses your local files instead of ` +
		`the compiled output the Docker image built. Compile it locally (e.g. 'npm run build') and call again, ` +
		`or run from the built image alone with 'apify call --no-dev-folder'.`
	);
}

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
