import { readdirSync, type Stats, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { ACTOR_SPECIFICATION_FOLDER } from './consts.js';
import { isOutside, toPosix } from './docker-context.js';

export interface ActorPathProblem {
	field: string;
	value: string;
	resolvedPath: string;
	reason: string;
}

export interface ActorPathsOptions {
	actorDir: string;
	/** What push sends: the Actor folder, or the source root of a monorepo Actor. */
	uploadRoot: string;
	/** Relative to `uploadRoot`, as the file collectors return them. */
	uploadedFiles: string[];
	config: Record<string, unknown>;
	/** When given, `dockerfile` must lie inside it, as BuildKit reads the Dockerfile from the context. */
	dockerContextRoot?: string;
}

/** The platform finds these by a directory listing, so their names match case-insensitively. */
const LISTED_FILE_FIELDS = ['dockerfile', 'readme', 'changelog'];
const SCHEMA_FIELDS = ['input', 'output', 'webServerSchema'];
const STORAGE_SCHEMA_FIELDS = ['keyValueStore', 'dataset'];

interface PathField {
	field: string;
	value: string;
	caseInsensitive: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Every file-path field the platform resolves relative to `.actor/`; an inline schema object is not a path. */
function collectPathFields(config: Record<string, unknown>): PathField[] {
	const fields: PathField[] = [];
	const add = (field: string, value: unknown, caseInsensitive = false) => {
		if (typeof value === 'string') fields.push({ field, value, caseInsensitive });
	};

	for (const field of LISTED_FILE_FIELDS) add(field, config[field], true);
	for (const field of SCHEMA_FIELDS) add(field, config[field]);
	if (isRecord(config.storages)) {
		for (const field of STORAGE_SCHEMA_FIELDS) add(`storages.${field}`, config.storages[field]);
		if (isRecord(config.storages.datasets)) {
			for (const [name, value] of Object.entries(config.storages.datasets)) {
				add(`storages.datasets.${name}`, value);
			}
		}
	}
	return fields;
}

function listDirectory(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function checkPathField(
	{ field, value, caseInsensitive }: PathField,
	{ actorDir, uploadRoot, uploadedFiles, dockerContextRoot }: ActorPathsOptions,
): ActorPathProblem | undefined {
	const problem = (resolvedPath: string, reason: string) => ({ field, value, resolvedPath, reason });
	if (isAbsolute(value)) return problem(value, `is absolute; the path is relative to ${ACTOR_SPECIFICATION_FOLDER}/`);

	const resolvedPath = resolve(actorDir, ACTOR_SPECIFICATION_FOLDER, value);
	const root = resolve(uploadRoot);
	if (isOutside(relative(root, resolvedPath))) return problem(resolvedPath, `lies outside the uploaded folder ${root}`);

	const dir = dirname(resolvedPath);
	const wanted = basename(resolvedPath);
	const entries = listDirectory(dir);
	const sameCase = entries.find((entry) => entry === wanted);
	const anyCase = entries.find((entry) => entry.toLowerCase() === wanted.toLowerCase());
	const name = sameCase ?? (caseInsensitive ? anyCase : undefined);
	if (!name) {
		return problem(
			resolvedPath,
			anyCase ? `does not exist (the name must match ${anyCase} exactly)` : 'does not exist',
		);
	}

	// push reads through a symlink and uploads the content at this path, so the path is judged as it is, not by its
	// target; a dangling symlink has no content to upload.
	const filePath = join(dir, name);
	let stats: Stats;
	try {
		stats = statSync(filePath);
	} catch {
		return problem(resolvedPath, 'does not exist');
	}
	if (stats.isDirectory()) return problem(resolvedPath, 'is a directory, not a file');
	if (dockerContextRoot && field === 'dockerfile' && isOutside(relative(resolve(dockerContextRoot), filePath))) {
		return problem(resolvedPath, `lies outside the Docker context ${dockerContextRoot}`);
	}

	const uploadedPath = toPosix(relative(root, filePath));
	const uploaded = uploadedFiles.map(toPosix);
	if (!uploaded.includes(uploadedPath)) {
		const differentCase = uploaded.find((uploadedFile) => uploadedFile.toLowerCase() === uploadedPath.toLowerCase());
		return problem(
			resolvedPath,
			differentCase
				? `does not match the case of the uploaded file ${differentCase}`
				: 'is not among the files apify push uploads (excluded by .gitignore or .actorignore?)',
		);
	}
	return undefined;
}

/**
 * Applies the platform's rules to every file path in `actor.json` before anything is uploaded: relative to
 * `.actor/`, inside the upload root, an existing file, and one that push sends. A symlink counts by its own path,
 * as push uploads its content there.
 */
export function checkActorPaths(options: ActorPathsOptions): ActorPathProblem[] {
	return collectPathFields(options.config).flatMap((pathField) => checkPathField(pathField, options) ?? []);
}

export function formatActorPathProblems(problems: ActorPathProblem[]): string {
	return [
		'.actor/actor.json refers to files the Apify platform could not use:',
		...problems.map(
			({ field, value, resolvedPath, reason }) => `  "${field}": "${value}" (${resolvedPath}) ${reason}.`,
		),
		`Paths are relative to ${ACTOR_SPECIFICATION_FOLDER}/ and must point to files inside the uploaded folder.`,
	].join('\n');
}
