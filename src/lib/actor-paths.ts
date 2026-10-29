import { readdirSync, realpathSync, type Stats, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { ACTOR_SPECIFICATION_FOLDER } from './consts.js';
import { isOutside, toPosix } from './docker-context.js';

/**
 * An `error` would fail the build or build the wrong thing, so push stops. A `warning` is a path the platform cannot
 * find but recovers from with its default lookup, so the build succeeds and push continues.
 */
export type ActorPathSeverity = 'error' | 'warning';

export interface ActorPathProblem {
	field: string;
	/** Empty when the field is not set and the problem lies with what the platform uses by default. */
	value: string;
	resolvedPath: string;
	reason: string;
	severity: ActorPathSeverity;
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
	 * build. The same holds for a context within the Actor folder, which today's push already sends. Without
	 * `dockerfile`, the Dockerfile the platform would find by default is held to the same rules. Pass it as
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
/**
 * When the worker cannot find the file these name, it logs a warning and falls back to its default lookup
 * (`.actor/ACTOR.md`, `.actor/README.md`, then `README.md` or `README` in the Actor folder; likewise for the
 * changelog), so the build succeeds. A missing `dockerfile` falls back too, but to a Dockerfile the user did not choose.
 */
const FALLBACK_FIELDS = new Set(['readme', 'changelog']);
/**
 * Without `dockerfile`, the worker takes the first of these that exists, relative to `.actor/`; with none, it copies
 * its built-in Node.js Dockerfile into the Docker context.
 */
const DEFAULT_DOCKERFILE_PATHS = ['./Dockerfile', '../Dockerfile'];

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

/** The entry for `filePath` in a listing of its directory, by the exact name and else by any case. */
function findEntry(filePath: string): { sameCase?: string; anyCase?: string } {
	const wanted = basename(filePath);
	const entries = listDirectory(dirname(filePath));
	return {
		sameCase: entries.find((entry) => entry === wanted),
		anyCase: entries.find((entry) => entry.toLowerCase() === wanted.toLowerCase()),
	};
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
 * 5. `dockerfile`, set or found by default, lies inside the Docker context, as BuildKit reads it from there.
 * 6. It is among the files push uploads, in the same case: a file `.gitignore` or `.actorignore` drops never
 *    reaches the platform.
 *
 * Every problem is an error, except for `readme` and `changelog` failing rules 1 (a backslash), 3, or 6: the worker
 * does not find such a file and falls back to its default, so these are warnings. An absolute path, a path outside
 * the upload root, or a directory fails the build for those fields too.
 */
function checkPathField(
	{ field, value, caseInsensitive }: PathField,
	{ actorDir, uploadRoot, uploadedFiles, dockerContextRoot }: PathCheckScope,
): ActorPathProblem | undefined {
	const problem = (resolvedPath: string, reason: string, platformFallsBack = false): ActorPathProblem => ({
		field,
		value,
		resolvedPath,
		reason,
		severity: platformFallsBack && FALLBACK_FIELDS.has(field) ? 'warning' : 'error',
	});
	if (value.includes('\\')) {
		return problem(value, 'uses a backslash; the platform resolves paths with forward slashes', true);
	}
	if (isAbsolute(value)) return problem(value, `is absolute; the path is relative to ${ACTOR_SPECIFICATION_FOLDER}/`);

	const resolvedPath = resolve(actorDir, ACTOR_SPECIFICATION_FOLDER, value);
	if (isOutside(relative(uploadRoot, resolvedPath))) {
		return problem(resolvedPath, `lies outside the uploaded folder ${uploadRoot}`);
	}

	const { sameCase, anyCase } = findEntry(resolvedPath);
	const name = sameCase ?? (caseInsensitive ? anyCase : undefined);
	if (!name) {
		return problem(
			resolvedPath,
			anyCase ? `does not exist (the name must match ${anyCase} exactly)` : 'does not exist',
			true,
		);
	}

	// push reads through a symlink and uploads the content at this path, so the path is judged as it is, not by its
	// target; a dangling symlink has no content to upload.
	const filePath = join(dirname(resolvedPath), name);
	let stats: Stats;
	try {
		stats = statSync(filePath);
	} catch {
		return problem(resolvedPath, 'does not exist', true);
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
			true,
		);
	}
	return undefined;
}

/**
 * Without `dockerfile`, the platform takes the first default Dockerfile that exists, else copies its built-in one into
 * the Docker context. The found default must pass the same rules as a set `dockerfile`. The built-in one is the
 * documented default for a context that is the Actor folder itself; in any other context it would build files the
 * built-in Dockerfile was never meant for, and silently ignore a Dockerfile the context may hold.
 */
function checkDefaultDockerfile(scope: PathCheckScope & { dockerContextRoot: string }): ActorPathProblem | undefined {
	const { actorDir, dockerContextRoot } = scope;
	const value = DEFAULT_DOCKERFILE_PATHS.find(
		(candidate) => findEntry(resolve(actorDir, ACTOR_SPECIFICATION_FOLDER, candidate)).anyCase,
	);
	if (value) {
		const problem = checkPathField({ field: 'dockerfile', value, caseInsensitive: true }, scope);
		return (
			problem && {
				...problem,
				value: '',
				reason: `is not set, so the platform would use the default ${problem.resolvedPath}, which ${problem.reason}`,
			}
		);
	}
	if (relative(actorDir, dockerContextRoot) === '') return undefined;
	return {
		field: 'dockerfile',
		value: '',
		resolvedPath: join(dockerContextRoot, 'Dockerfile'),
		reason:
			`is not set and there is no ${ACTOR_SPECIFICATION_FOLDER}/Dockerfile or Dockerfile in the Actor folder, ` +
			`so the platform would build the Docker context ${dockerContextRoot} with its built-in Node.js Dockerfile; ` +
			'add a Dockerfile, or set "dockerfile" to one inside the Docker context',
		severity: 'error',
	};
}

/**
 * Applies the platform's rules to every file path in `actor.json` before anything is uploaded: relative to
 * `.actor/`, inside the upload root, an existing file, and one that push sends. A symlink counts by its own path,
 * as push uploads its content there. With a Docker context and no `dockerfile`, the default Dockerfile is checked too.
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
	const pathFields = collectPathFields(options.config);
	const problems = pathFields.flatMap((pathField) => checkPathField(pathField, scope) ?? []);

	const { dockerContextRoot } = scope;
	if (dockerContextRoot && !pathFields.some(({ field }) => field === 'dockerfile')) {
		const problem = checkDefaultDockerfile({ ...scope, dockerContextRoot });
		if (problem) problems.push(problem);
	}
	return problems;
}

const PROBLEM_HEADERS: Record<ActorPathSeverity, string> = {
	error: '.actor/actor.json refers to files the Apify platform could not use:',
	warning:
		'.actor/actor.json refers to files the Apify platform will not find. ' +
		'The push continues, and the platform falls back to its default README or CHANGELOG:',
};

/** The message for the problems of one severity, with a header that says what happens; empty when there are none. */
export function formatActorPathProblems(problems: ActorPathProblem[], severity: ActorPathSeverity): string {
	const selected = problems.filter((problem) => problem.severity === severity);
	if (selected.length === 0) return '';
	return [
		PROBLEM_HEADERS[severity],
		...selected.map(({ field, value, resolvedPath, reason }) =>
			value ? `  "${field}": "${value}" (${resolvedPath}) ${reason}.` : `  "${field}" ${reason}.`,
		),
		`Paths are relative to ${ACTOR_SPECIFICATION_FOLDER}/ and must point to files inside the uploaded folder.`,
	].join('\n');
}
