import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { LOCAL_CONFIG_PATH } from './consts.js';
import { ACTOR_FILES_HARDCODED_IGNORE, getGitignoreMatcher, getJsonFileContent } from './utils.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const SKIPPED_DIRECTORY_NAMES = new Set(ACTOR_FILES_HARDCODED_IGNORE.map((pattern) => pattern.replace(/\/\*\*$/, '')));

export interface FoundActorDir {
	/** Path of the Actor directory relative to the root, with `/` separators. */
	dir: string;
	/** The `name` from its `.actor/actor.json`, when the file could be read. */
	name: string | undefined;
	/** Whether .gitignore rules exclude the directory, judged from the root with the matcher the upload uses. */
	ignored: boolean;
}

/** Turns a directory below `root` into the `/`-separated relative path used to address it. */
export function toPosixRelative(root: string, dir: string): string {
	return relative(root, dir).split(sep).join('/');
}

function readActorName(dir: string): string | undefined {
	try {
		const name = getJsonFileContent(join(dir, LOCAL_CONFIG_PATH))?.name;

		return typeof name === 'string' ? name : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Finds every directory below `root` with a `.actor/actor.json`, sorted by path. Skips the directory names
 * `getActorLocalFilePaths` always ignores (at any depth, not only at the root) and does not descend below a
 * found Actor. A directory that cannot be read is skipped; when that is the root, nothing is found.
 * An Actor in a directory .gitignore ignores is still found, marked `ignored`.
 */
export async function findActorDirs(root: string): Promise<FoundActorDir[]> {
	const found: Omit<FoundActorDir, 'ignored'>[] = [];

	const walk = async (dir: string) => {
		let entries;

		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch (err) {
			cliDebugPrint('findActorDirs', { event: 'unreadable-directory', dir, err });

			return;
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
				continue;
			}

			const child = join(dir, entry.name);

			if (existsSync(join(child, LOCAL_CONFIG_PATH))) {
				found.push({ dir: toPosixRelative(root, child), name: readActorName(child) });
			} else {
				await walk(child);
			}
		}
	};

	await walk(root);

	if (!found.length) {
		return [];
	}

	const isGitignored = await getGitignoreMatcher(
		root,
		found.map((actor) => `${actor.dir}/`),
	);

	return found
		.map((actor) => ({ ...actor, ignored: isGitignored(`${actor.dir}/`) }))
		.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}
