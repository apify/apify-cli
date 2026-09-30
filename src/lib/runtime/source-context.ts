import { execFileSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { ApifyClient } from 'apify-client';
import { TarArchive } from 'archiver';

import { ACTOR_SPECIFICATION_FOLDER, APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { getActorLocalFilePaths } from '../utils.js';

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
	const status = git(dir, ['status', '--porcelain', '--', '.']);
	if (status !== undefined) provenance.dirty = status.length > 0;
	return provenance;
}

/** The files at `paths` under `root`, as one in-memory `.tar.gz`, each named by its path relative to `root`. */
export async function createContextTarball(paths: string[], root: string): Promise<Buffer> {
	// Level 6: the same speed/size balance as the ZIP upload of an ordinary push.
	const archive = new TarArchive({ gzip: true, gzipOptions: { level: 6 } });
	const chunks: Buffer[] = [];
	archive.on('data', (chunk: Buffer) => chunks.push(chunk));
	const ended = new Promise<void>((resolve, reject) => {
		archive.once('end', resolve);
		archive.once('error', reject);
	});
	for (const filePath of paths) {
		archive.file(join(root, filePath), { name: filePath.split(sep).join('/') });
	}
	await archive.finalize();
	await ended;
	return Buffer.concat(chunks);
}

export interface SourceContextUpload {
	actorPath: string;
	tarball: Buffer;
	git?: GitProvenance;
}

/**
 * `PUT /actor-runtime/source-context/:actorId/:versionNumber` - replaces the version's source with the whole
 * Docker context, sent as one `.tar.gz`. `unsupported` means the target has no such endpoint: not an Actor runtime, or an older one.
 */
export async function pushActorRuntimeSourceContext(
	client: Pick<ApifyClient, 'baseUrl' | 'token'>,
	actorId: string,
	versionNumber: string,
	upload: SourceContextUpload,
): Promise<{ ok: true } | { ok: false; unsupported: boolean; error: string }> {
	// `baseUrl` already ends in `/v2`; the runtime serves `/v2/actor-runtime/*` as an alias of `/actor-runtime/*`.
	const url = new URL(
		`${client.baseUrl}/actor-runtime/source-context/${encodeURIComponent(actorId)}/${encodeURIComponent(versionNumber)}`,
	);
	url.searchParams.set('actorPath', upload.actorPath);
	const { git } = upload;
	if (git?.remoteUrl) url.searchParams.set('gitRemoteUrl', git.remoteUrl);
	if (git?.branch) url.searchParams.set('gitBranch', git.branch);
	if (git?.commit) url.searchParams.set('gitCommit', git.commit);
	if (git?.dirty !== undefined) url.searchParams.set('gitDirty', String(git.dirty));

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			...APIFY_CLIENT_DEFAULT_HEADERS,
			'Authorization': `Bearer ${client.token}`,
			'Content-Type': 'application/gzip',
		},
		body: new Uint8Array(upload.tarball.buffer, upload.tarball.byteOffset, upload.tarball.byteLength),
	});
	if (response.ok) return { ok: true };

	const payload = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
	const error = payload?.error?.message ?? `${response.status} ${response.statusText}`;
	// A missing route answers `not-found`; a missing Actor or version answers `record-not-found`.
	const unsupported = response.status === 404 && payload?.error?.type !== 'record-not-found';
	return { ok: false, unsupported, error };
}

/**
 * The files of the Docker context at `contextRoot`, relative to it. Those in the Actor's folder are exactly
 * what an ordinary push of that folder sends (`actorFilePaths`), so its own `.actorignore` applies there;
 * the rest follow the context root's `.gitignore` and `.actorignore`.
 */
export async function getContextFilePaths(
	contextRoot: string,
	actorPath: string,
	actorFilePaths: string[],
): Promise<string[]> {
	const actorFolder = actorPath.split('/').join(sep);
	const outsideActor = (await getActorLocalFilePaths(contextRoot)).filter(
		(filePath) => filePath !== actorFolder && !filePath.startsWith(`${actorFolder}${sep}`),
	);
	return [...outsideActor, ...actorFilePaths.map((filePath) => join(actorFolder, filePath))];
}

/** For a target that answered the context upload as an unknown endpoint. */
export function monorepoOutdatedRuntimeMessage(baseUrl: string): string {
	return [
		`${baseUrl} does not accept monorepo Actors. If it is a local Actor runtime, update it with 'apify runtime install'.`,
		`The Apify platform does not accept them from apify push yet: ${MONOREPO_PLATFORM_SUPPORT_ISSUE_URL}`,
	].join('\n');
}

export function monorepoUnsupportedMessage(actorName: string): string {
	return [
		`Actor ${actorName} sets "dockerContextDir" in .actor/actor.json, so it builds from a Docker context outside its own folder (a monorepo Actor).`,
		'apify push does not support such Actors on the Apify platform yet. Follow the progress at:',
		`  ${MONOREPO_PLATFORM_SUPPORT_ISSUE_URL}`,
		`Until then, connect the platform to the Git repository instead, or push to a local Actor runtime ('apify runtime connect').`,
	].join('\n');
}
