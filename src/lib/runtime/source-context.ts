import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { ApifyClient } from 'apify-client';

import { ACTOR_SPECIFICATION_FOLDER, APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';

/** Tracks pushing Actors with `dockerContextDir` (monorepo Actors) to the Apify platform. */
export const MONOREPO_PLATFORM_SUPPORT_ISSUE_URL = 'https://github.com/apify/apify-core/issues/28685';

export type DockerContextResolution =
	| { kind: 'none' }
	| { kind: 'context'; contextRoot: string; actorPath: string }
	| { kind: 'invalid'; message: string };

/**
 * Where `dockerContextDir` from `.actor/actor.json` puts the Docker context, resolved like the platform does:
 * relative to the `.actor` folder. A context that is the Actor's own folder is an ordinary push.
 */
export function resolveDockerContext(actorDir: string, dockerContextDir: unknown): DockerContextResolution {
	if (dockerContextDir === undefined || dockerContextDir === null || dockerContextDir === '') return { kind: 'none' };
	if (typeof dockerContextDir !== 'string') {
		return { kind: 'invalid', message: `"dockerContextDir" in .actor/actor.json must be a string.` };
	}

	const contextRoot = resolve(actorDir, ACTOR_SPECIFICATION_FOLDER, dockerContextDir);
	const actorPath = relative(contextRoot, actorDir);
	if (actorPath === '') return { kind: 'none' };
	if (isAbsolute(actorPath) || actorPath === '..' || actorPath.startsWith(`..${sep}`)) {
		return {
			kind: 'invalid',
			message: `"dockerContextDir" in .actor/actor.json points to ${contextRoot}, which does not contain the Actor's folder.`,
		};
	}

	return { kind: 'context', contextRoot, actorPath: actorPath.split(sep).join('/') };
}

export interface GitProvenance {
	remoteUrl?: string;
	branch?: string;
	commit?: string;
	dirty?: boolean;
}

function git(cwd: string, args: string[]): string | undefined {
	try {
		const output = execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
		return output.trim();
	} catch {
		return undefined;
	}
}

/** A remote URL may carry credentials (`https://user:token@host/...`); they never leave this machine. */
function withoutCredentials(remoteUrl: string): string {
	try {
		const url = new URL(remoteUrl);
		url.username = '';
		url.password = '';
		return url.toString();
	} catch {
		// scp-like `git@host:owner/repo.git` has no password to strip.
		return remoteUrl;
	}
}

/** What the runtime shows about where the pushed files came from. Empty outside a Git working copy. */
export function readGitProvenance(dir: string): GitProvenance {
	const commit = git(dir, ['rev-parse', 'HEAD']);
	if (!commit) return {};

	const provenance: GitProvenance = { commit };
	const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (branch && branch !== 'HEAD') provenance.branch = branch;
	const remoteUrl = git(dir, ['remote', 'get-url', 'origin']);
	if (remoteUrl) provenance.remoteUrl = withoutCredentials(remoteUrl);
	const status = git(dir, ['status', '--porcelain']);
	if (status !== undefined) provenance.dirty = status.length > 0;
	return provenance;
}

export interface SourceContextUpload {
	actorPath: string;
	sourceFiles: { name: string; format: string; content: string }[];
	git?: GitProvenance;
}

/**
 * `PUT /actor-runtime/source-context/:actorId/:versionNumber` - replaces the version's source with the whole
 * Docker context. `unsupported` means the target has no such endpoint: not an Actor runtime, or an older one.
 */
export async function pushActorRuntimeSourceContext(
	client: Pick<ApifyClient, 'baseUrl' | 'token'>,
	actorId: string,
	versionNumber: string,
	upload: SourceContextUpload,
): Promise<{ ok: true } | { ok: false; unsupported: boolean; error: string }> {
	// `baseUrl` already ends in `/v2`; the runtime serves `/v2/actor-runtime/*` as an alias of `/actor-runtime/*`.
	const url = `${client.baseUrl}/actor-runtime/source-context/${encodeURIComponent(actorId)}/${encodeURIComponent(versionNumber)}`;
	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			...APIFY_CLIENT_DEFAULT_HEADERS,
			'Authorization': `Bearer ${client.token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(upload),
	});
	if (response.ok) return { ok: true };

	const payload = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
	const error = payload?.error?.message ?? `${response.status} ${response.statusText}`;
	// A missing route answers `not-found`; a missing Actor or version answers `record-not-found`.
	const unsupported = response.status === 404 && payload?.error?.type !== 'record-not-found';
	return { ok: false, unsupported, error };
}

export function monorepoUnsupportedMessage(actorName: string): string {
	return [
		`Actor ${actorName} sets "dockerContextDir" in .actor/actor.json, so it builds from a Docker context outside its own folder (a monorepo Actor).`,
		'apify push does not support such Actors on the Apify platform yet. Follow the progress at:',
		`  ${MONOREPO_PLATFORM_SUPPORT_ISSUE_URL}`,
		`Until then, connect the platform to the Git repository instead, or push to a local Actor runtime ('apify runtime connect').`,
	].join('\n');
}
