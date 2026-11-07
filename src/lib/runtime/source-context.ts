import { lstatSync, readlinkSync } from 'node:fs';
import { join, sep } from 'node:path';

import type { ApifyClient } from 'apify-client';
import { TarArchive } from 'archiver';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { type GitState, MONOREPO_PLATFORM_SUPPORT_ISSUE_URL } from '../docker-context.js';

export async function createContextTarball(paths: string[], root: string): Promise<Buffer> {
	const archive = new TarArchive({ gzip: true, gzipOptions: { level: 6 } });
	const chunks: Buffer[] = [];
	archive.on('data', (chunk: Buffer) => chunks.push(chunk));
	const ended = new Promise<void>((resolve, reject) => {
		archive.once('end', resolve);
		archive.once('error', reject);
	});
	for (const filePath of paths) {
		const name = filePath.split(sep).join('/');
		const absolutePath = join(root, filePath);
		if (lstatSync(absolutePath).isSymbolicLink()) archive.symlink(name, readlinkSync(absolutePath));
		else archive.file(absolutePath, { name });
	}
	await archive.finalize();
	await ended;
	return Buffer.concat(chunks);
}

export interface SourceContextUpload {
	actorPath: string;
	tarball: Buffer;
	git?: GitState;
}

/** `unsupported`: the target has no such endpoint - not an Actor runtime, or an older one. */
export async function pushActorRuntimeSourceContext(
	client: Pick<ApifyClient, 'baseUrl' | 'token'>,
	actorId: string,
	versionNumber: string,
	upload: SourceContextUpload,
): Promise<{ ok: true } | { ok: false; unsupported: boolean; error: string }> {
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

export function monorepoOutdatedRuntimeMessage(baseUrl: string): string {
	return [
		`${baseUrl} does not accept monorepo Actors. If it is a local Actor runtime, update it with 'apify runtime install'.`,
		`The Apify platform does not accept them from apify push yet: ${MONOREPO_PLATFORM_SUPPORT_ISSUE_URL}`,
	].join('\n');
}
