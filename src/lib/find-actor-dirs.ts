import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { LOCAL_CONFIG_PATH } from './consts.js';
import { ACTOR_FILES_HARDCODED_IGNORE, getJsonFileContent } from './utils.js';

const SKIPPED_DIRECTORY_NAMES = new Set(ACTOR_FILES_HARDCODED_IGNORE.map((pattern) => pattern.replace(/\/\*\*$/, '')));

export interface FoundActorDir {
	/** Path of the Actor directory relative to the root, with `/` separators. */
	dir: string;
	/** The `name` from its `.actor/actor.json`, when the file could be read. */
	name: string | undefined;
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
 * Finds every directory below `root` with a `.actor/actor.json`, sorted by path. Skips the directories
 * `getActorLocalFilePaths` always ignores and does not descend below a found Actor.
 */
export async function findActorDirs(root: string): Promise<FoundActorDir[]> {
	const found: FoundActorDir[] = [];

	const walk = async (dir: string) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
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

	return found.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}
