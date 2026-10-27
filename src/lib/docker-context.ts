// The Docker context of an Actor: where `dockerContextDir` in `.actor/actor.json` points and what a push of it
// carries.
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { ACTOR_SPECIFICATION_FOLDER } from './consts.js';
import { getActorLocalFilePaths } from './utils.js';

/** Tracks pushing Actors with `dockerContextDir` (monorepo Actors) to the Apify platform. */
export const MONOREPO_PLATFORM_SUPPORT_ISSUE_URL = 'https://github.com/apify/apify-core/issues/28685';

export type DockerContextResolution =
	/** `dockerContextDir` is absent: undefined, null, or an empty string. */
	| { kind: 'none' }
	/** The context is the Actor folder itself or a directory inside it, so a push of the folder carries it. */
	| {
			kind: 'within';
			/** As the upload lays it out: the path as written, from the Actor folder's real path. */
			contextRoot: string;
	  }
	/** The context lies beyond the Actor folder (a monorepo Actor): above it, or elsewhere in the Git repository. */
	| {
			kind: 'outside';
			/** As the upload lays it out: the path as written, from the Actor folder's real path. */
			contextRoot: string;
			/** The Git repository's root, else the context. */
			sourceRoot: string;
			/** Relative to `sourceRoot`. */
			actorPath: string;
	  }
	/** The field is not a string, or the directory it names is missing, not a directory, or out of reach. */
	| { kind: 'invalid'; message: string };

/**
 * `dockerContextDir` is relative to `.actor/`, as on the platform. An absent field is `none`, with no path work. A
 * context at or below the Actor folder is `within`: an ordinary push, which the platform builds as it is. A context
 * above or beside the Actor folder is `outside`: a monorepo Actor, with the source root a push would have to carry.
 * A context that cannot be used is `invalid`, with the message to show. The context path comes back as the upload
 * lays it out, the source root as a real path.
 */
export function resolveDockerContext(actorDir: string, dockerContextDir: unknown): DockerContextResolution {
	if (dockerContextDir === undefined || dockerContextDir === null || dockerContextDir === '') return { kind: 'none' };
	if (typeof dockerContextDir !== 'string') {
		return { kind: 'invalid', message: `"dockerContextDir" in .actor/actor.json must be a string.` };
	}

	// The platform resolves the context from the Actor folder's real path, so a symlinked `--dir` must too.
	let realActorDir: string;
	try {
		realActorDir = realpathSync(actorDir);
	} catch {
		return { kind: 'invalid', message: `The Actor folder ${actorDir} does not exist.` };
	}

	const contextRoot = resolve(realActorDir, ACTOR_SPECIFICATION_FOLDER, dockerContextDir);
	const contextStats = statSync(contextRoot, { throwIfNoEntry: false });
	if (!contextStats) {
		return {
			kind: 'invalid',
			message: `"dockerContextDir" in .actor/actor.json points to ${contextRoot}, which does not exist.`,
		};
	}
	if (!contextStats.isDirectory()) {
		return {
			kind: 'invalid',
			message: `"dockerContextDir" in .actor/actor.json points to ${contextRoot}, which is not a directory.`,
		};
	}
	const realContextRoot = realpathSync(contextRoot);

	// Inside or outside the Actor folder is judged, and returned, by the path as written, not by where a symlink on it
	// leads. Push follows a symlink and uploads its files under the link's own name: with `"dockerContextDir": "../sym"`
	// and `sym` linking to a folder outside, the platform receives `sym` as a normal folder inside the Actor and builds
	// from it.
	const contextPathInActor = relative(realActorDir, contextRoot);
	if (contextPathInActor === '' || !isOutside(contextPathInActor)) {
		return { kind: 'within', contextRoot };
	}

	// The platform's clone holds nothing above the repository root.
	const repoRoot = git(realActorDir, ['rev-parse', '--show-toplevel']);
	if (repoRoot) {
		const sourceRoot = realpathSync(repoRoot);
		if (isOutside(relative(sourceRoot, realContextRoot))) {
			return {
				kind: 'invalid',
				message:
					`"dockerContextDir" in .actor/actor.json points to ${realContextRoot}, outside the Git repository ${sourceRoot}. ` +
					'The Apify platform builds from a clone of the repository, so it could not build this Actor.',
			};
		}
		return {
			kind: 'outside',
			contextRoot,
			sourceRoot,
			actorPath: toPosix(relative(sourceRoot, realActorDir)),
		};
	}

	const actorPath = relative(realContextRoot, realActorDir);
	if (isOutside(actorPath)) {
		return {
			kind: 'invalid',
			message: `"dockerContextDir" in .actor/actor.json points to ${realContextRoot}, which does not contain the Actor's folder.`,
		};
	}
	return { kind: 'outside', contextRoot, sourceRoot: realContextRoot, actorPath: toPosix(actorPath) };
}

export function isOutside(relativePath: string): boolean {
	return isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`);
}

export function toPosix(filePath: string): string {
	return filePath.split(sep).join('/');
}

export interface GitState {
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

export function readGitState(dir: string): GitState {
	const commit = git(dir, ['rev-parse', 'HEAD']);
	if (!commit) return {};

	const state: GitState = { commit };
	const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (branch && branch !== 'HEAD') state.branch = branch;
	const remoteUrl = git(dir, ['remote', 'get-url', 'origin']);
	if (remoteUrl) state.remoteUrl = withoutCredentials(remoteUrl);
	const status = git(dir, ['status', '--porcelain', '--', '.']);
	if (status !== undefined) state.dirty = status.length > 0;
	return state;
}

/** Untracked, these are never on the platform and too big to push by accident. */
const UNTRACKED_IGNORED_SEGMENTS = new Set(['node_modules', 'storage', 'apify_storage', 'crawlee_storage']);

function gitFileList(root: string, args: string[]): string[] | undefined {
	const output = git(root, ['ls-files', '-z', ...args]);
	return output?.split('\0').filter(Boolean);
}

/**
 * What a Git clone of `root` has, as on disk now, plus untracked files Git does not ignore; `.actorignore` does not
 * apply, as on the platform. Outside Git, what an ordinary push of `root` sends. The paths are relative to `root`
 * with forward slashes on every platform, as `getActorLocalFilePaths` returns them.
 */
export async function getContextFilePaths(root: string): Promise<string[]> {
	const tracked = gitFileList(root, ['--cached']);
	const untracked = gitFileList(root, ['--others', '--exclude-standard']);
	if (!tracked || !untracked) return getActorLocalFilePaths(root);

	// Skips files deleted locally and submodules (listed as directories).
	const isPushable = (filePath: string) => {
		try {
			const stats = lstatSync(join(root, filePath));
			return stats.isSymbolicLink() || stats.isFile();
		} catch {
			return false;
		}
	};
	return [
		...tracked.filter(isPushable),
		...untracked.filter(
			(filePath) =>
				isPushable(filePath) && !filePath.split('/').some((segment) => UNTRACKED_IGNORED_SEGMENTS.has(segment)),
		),
	];
}

export function monorepoUnsupportedMessage(actorName: string): string {
	return [
		`Actor ${actorName} sets "dockerContextDir" in .actor/actor.json, so it builds from a Docker context outside its own folder (a monorepo Actor).`,
		'apify push does not support such Actors on the Apify platform yet. Follow the progress at:',
		`  ${MONOREPO_PLATFORM_SUPPORT_ISSUE_URL}`,
		`Until then, set the Actor's source in Apify Console to the Git repository with the folder (<repository URL>#<branch>:<folder>).`,
	].join('\n');
}
