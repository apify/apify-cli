import { readdirSync, realpathSync, type Stats, statSync } from 'node:fs';
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
	/**
	 * When given, `dockerfile` must lie inside it. The worker runs BuildKit with `--local dockerfile=<context dir>`
	 * and `filename=<Dockerfile relative to the context>`, so a Dockerfile outside the context cannot be read by the
	 * build. The same holds for a context within the Actor folder, which today's push already sends. Pass it as
	 * `resolveDockerContext` returns it: the path as written, from the real Actor folder.
	 */
	dockerContextRoot?: string;
}

/** The platform finds these by a directory listing, so their names match case-insensitively. */
const LISTED_FILE_FIELDS = ['dockerfile', 'readme', 'changelog'];
/** The worker copies a set alias over its base key before resolving, so the alias wins and the base key is ignored. */
const SCHEMA_FIELDS: { field: string; alias?: string }[] = [
	{ field: 'input', alias: 'inputSchema' },
	{ field: 'output', alias: 'outputSchema' },
	{ field: 'webServerSchema' },
];
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
		// The worker treats an empty string as an unset field.
		if (typeof value === 'string' && value !== '') fields.push({ field, value, caseInsensitive });
	};

	for (const field of LISTED_FILE_FIELDS) add(field, config[field], true);
	for (const { field, alias } of SCHEMA_FIELDS) {
		if (alias && config[alias]) add(alias, config[alias]);
		else add(field, config[field]);
	}
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

/** The options as every field sees them: real roots and the uploaded files as posix paths. */
interface PathCheckScope {
	actorDir: string;
	uploadRoot: string;
	uploadedFiles: Set<string>;
	dockerContextRoot?: string;
}

/**
 * Applies the platform's rules to one path field of `actor.json`, in order; the first failing rule wins.
 * 1. No backslashes and not absolute: the platform resolves the value relative to `.actor/` on Linux.
 * 2. Resolved from `.actor/`, it lies inside the upload root; the platform never sees anything else.
 * 3. The file exists in its directory: by any case for `dockerfile`, `readme` and `changelog`, which the
 *    platform finds by listing the directory, and by the exact name for schema references. A dangling symlink
 *    does not exist.
 * 4. It is a file, not a directory.
 * 5. `dockerfile` lies inside the Docker context, as BuildKit reads it from there.
 * 6. It is among the files push uploads, in the same case: a file `.gitignore` or `.actorignore` drops never
 *    reaches the platform.
 */
function checkPathField(
	{ field, value, caseInsensitive }: PathField,
	{ actorDir, uploadRoot, uploadedFiles, dockerContextRoot }: PathCheckScope,
): ActorPathProblem | undefined {
	const problem = (resolvedPath: string, reason: string) => ({ field, value, resolvedPath, reason });
	if (value.includes('\\')) {
		return problem(value, 'uses a backslash; the platform resolves paths with forward slashes');
	}
	if (isAbsolute(value)) return problem(value, `is absolute; the path is relative to ${ACTOR_SPECIFICATION_FOLDER}/`);

	const resolvedPath = resolve(actorDir, ACTOR_SPECIFICATION_FOLDER, value);
	if (isOutside(relative(uploadRoot, resolvedPath))) {
		return problem(resolvedPath, `lies outside the uploaded folder ${uploadRoot}`);
	}

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
	if (dockerContextRoot && field === 'dockerfile' && isOutside(relative(dockerContextRoot, filePath))) {
		return problem(resolvedPath, `lies outside the Docker context ${dockerContextRoot}`);
	}

	const uploadedPath = toPosix(relative(uploadRoot, filePath));
	if (!uploadedFiles.has(uploadedPath)) {
		const differentCase = [...uploadedFiles].find((file) => file.toLowerCase() === uploadedPath.toLowerCase());
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
	// The Actor folder and the upload root are real paths, as the Docker context resolver works from them, so a
	// symlinked Actor folder does not count as an escape. A referenced path, like the Docker context the resolver
	// returns, is judged as written below the real Actor folder, the way push lays out the upload.
	const scope: PathCheckScope = {
		actorDir: realpathSync(options.actorDir),
		uploadRoot: realpathSync(options.uploadRoot),
		uploadedFiles: new Set(options.uploadedFiles.map(toPosix)),
		dockerContextRoot: options.dockerContextRoot,
	};
	return collectPathFields(options.config).flatMap((pathField) => checkPathField(pathField, scope) ?? []);
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
