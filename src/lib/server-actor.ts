import { setTimeout as delay } from 'node:timers/promises';

import type { Actor, ApifyClient, Build } from 'apify-client';

import { HTTP_METHODS } from './commands/http-request.js';
import { resolveActorContext } from './commands/resolve-actor-context.js';
import { success, warning } from './outputs.js';

/** The router's total budget from request to the first response byte. */
export const SERVER_REQUEST_TIMEOUT_MILLIS = 5 * 60 * 1_000;

export const DEFAULT_LOCAL_SERVER_PORT = 4321;

const READINESS_PROBE_HEADER = 'x-apify-container-server-readiness-probe';
const READINESS_PROBE_INTERVAL_MILLIS = 500;
const READINESS_PROBE_WARNING_MILLIS = 30_000;

const BUILD_NUMBER_REGEX = /^\d+\.\d+\.\d+$/;
const OPENAPI_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

// apify-client 2.25.0 types omit `standbyUrl`, `actorStandby.tenancy`, the build's web server fields and
// `buildNumber` on build list items; the API returns all of them.
type ActorWithServerFields = Actor & {
	standbyUrl?: string | null;
	actorStandby?: Actor['actorStandby'] & { tenancy?: string };
};

type ActorDefinitionWithServerFields = NonNullable<Build['actorDefinition']> & {
	webServerSchema?: unknown;
	webServerMcpPath?: string;
};

export interface ServerActor {
	id: string;
	userFriendlyId: string;
	standbyUrl: string;
	tenancy?: string;
	buildRef?: string;
	taggedBuilds: Actor['taggedBuilds'];
	standby: NonNullable<ActorWithServerFields['actorStandby']>;
}

export function isMultiTenant(actor: Pick<ServerActor, 'tenancy'>) {
	return actor.tenancy === 'MULTI_TENANT';
}

/** Points callers of the input interface to the server interface; dual-mode Actors are legitimate, so it only informs. */
export function getServerInterfaceHint(actor: Actor, userFriendlyId: string): string | undefined {
	if (!actor.actorStandby?.isEnabled) {
		return undefined;
	}

	return (
		`${userFriendlyId} also has a server interface. ` +
		`To send it HTTP requests instead of starting a run, use "apify server request ${userFriendlyId} <path>".`
	);
}

export interface ServerOperation {
	method: string;
	path: string;
	summary?: string;
}

export async function resolveServerActor(client: ApifyClient, target: string | undefined): Promise<ServerActor> {
	const ctx = await resolveActorContext({ providedActorNameOrId: target, client });

	if (!ctx.valid) {
		throw new Error(
			target
				? `${ctx.reason}.`
				: 'No Actor specified and the current directory is not an Actor project. Pass an Actor ID or "username/name".',
		);
	}

	const actor = (await client.actor(ctx.id).get()) as ActorWithServerFields | undefined;

	if (!actor) {
		throw new Error(`Actor "${ctx.userFriendlyId}" was not found.`);
	}

	if (!actor.actorStandby?.isEnabled || !actor.standbyUrl) {
		throw new Error(
			`Actor "${ctx.userFriendlyId}" has no server interface. ` +
				`Run it with "apify call ${ctx.userFriendlyId}" instead.`,
		);
	}

	return {
		id: actor.id,
		userFriendlyId: ctx.userFriendlyId,
		standbyUrl: actor.standbyUrl,
		tenancy: actor.actorStandby.tenancy,
		buildRef: actor.actorStandby.build,
		taggedBuilds: actor.taggedBuilds,
		standby: actor.actorStandby,
	};
}

/** Shortens an OpenAPI summary to its first line, cut at a word boundary. */
export function shortenSummary(summary: string, maxLength = 100): string {
	const firstLine = summary.split('\n')[0].trim();

	if (firstLine.length <= maxLength) {
		return firstLine;
	}

	const cut = firstLine.slice(0, maxLength - 1);
	const lastSpace = cut.lastIndexOf(' ');

	return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Resolves the build that serves the server interface. This is `actorStandby.build`, which can differ from the
 * default build, so there is deliberately no fallback to it.
 */
export async function resolveServerBuild(client: ApifyClient, actor: ServerActor): Promise<Build> {
	const ref = actor.buildRef;

	if (!ref) {
		throw new Error(`Actor "${actor.userFriendlyId}" has no build set for its server interface.`);
	}

	let buildId: string | undefined;

	if (BUILD_NUMBER_REGEX.test(ref)) {
		const { items } = await client.actor(actor.id).builds().list({ desc: true, limit: 1000 });
		buildId = (items as { id: string; buildNumber?: string }[]).find((build) => build.buildNumber === ref)?.id;
	} else {
		buildId = actor.taggedBuilds?.[ref]?.buildId;
	}

	const build = buildId ? await client.build(buildId).get() : undefined;

	if (!build) {
		throw new Error(
			`The server interface of Actor "${actor.userFriendlyId}" uses build "${ref}", which was not found.`,
		);
	}

	return build;
}

export function getServerDefinition(build: Build): { webServerSchema?: unknown; webServerMcpPath?: string } {
	const definition = build.actorDefinition as ActorDefinitionWithServerFields | undefined;
	return { webServerSchema: definition?.webServerSchema, webServerMcpPath: definition?.webServerMcpPath };
}

/** Lists the operations in an OpenAPI document. An empty schema passes the build check, so it yields no operations. */
export function listServerOperations(schema: unknown): ServerOperation[] {
	if (!schema || typeof schema !== 'object') {
		return [];
	}

	const { paths } = schema as { paths?: unknown };

	if (!paths || typeof paths !== 'object') {
		return [];
	}

	const operations: ServerOperation[] = [];

	for (const [path, item] of Object.entries(paths as Record<string, unknown>)) {
		if (!item || typeof item !== 'object') {
			continue;
		}

		for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
			if (!OPENAPI_METHODS.has(method.toLowerCase())) {
				continue;
			}

			const summary = (operation as { summary?: unknown } | null)?.summary;
			operations.push({
				method: method.toUpperCase(),
				path,
				summary: typeof summary === 'string' ? summary : undefined,
			});
		}
	}

	return operations;
}

/**
 * Resolves `path` against the server interface URL. The host always comes from `standbyUrl`, never from user input:
 * a leading slash alone is not enough, because `//other-host/x` also starts with one.
 */
export function resolveServerRequestUrl(standbyUrl: string, path: string, queryString = ''): URL {
	if (!path.startsWith('/')) {
		throw new Error(`The path must start with "/", got "${path}". Pass a path, not a full URL.`);
	}

	const base = new URL(standbyUrl);
	const url = new URL(path, base);

	if (url.origin !== base.origin || url.username || url.password) {
		throw new Error(`The path "${path}" points outside ${base.origin}. Pass a path on the Actor's server.`);
	}

	if (queryString) {
		for (const [key, value] of new URLSearchParams(queryString)) {
			url.searchParams.append(key, value);
		}
	}

	if (url.searchParams.has('token')) {
		throw new Error('Do not put the API token in the URL. The CLI sends it in the Authorization header.');
	}

	return url;
}

/**
 * Splits `[METHOD] [target] [path]`. A first argument starting with "/" is a path, and the target then comes
 * from the current directory.
 */
export function parseServerRequestArgs(args: (string | undefined)[]): {
	method?: string;
	target?: string;
	path: string;
} {
	const tokens = args.filter((arg): arg is string => arg !== undefined && arg !== '');
	let method: string | undefined;

	if (tokens.length > 0 && HTTP_METHODS.includes(tokens[0].toUpperCase())) {
		method = tokens.shift()!.toUpperCase();
	}

	let target: string | undefined;

	if (tokens.length > 0 && !tokens[0].startsWith('/')) {
		target = tokens.shift();
	}

	const path = tokens.shift() ?? '/';

	if (tokens.length > 0) {
		throw new Error(`Unexpected argument "${tokens[0]}". Usage: apify server request [METHOD] [target] [path]`);
	}

	return { method, target, path };
}

/** Maps router errors (`{ error: { type, message } }`) to a hint; Actor errors pass through without one. */
export function describeServerError(status: number, body: string): string | undefined {
	let type: string | undefined;

	try {
		type = (JSON.parse(body) as { error?: { type?: unknown } }).error?.type as string | undefined;
	} catch {
		// Not a router error body; the Actor answered.
	}

	switch (type) {
		case 'failed-to-choose-actor-run':
			return 'The platform could not start or find a run of this Actor within 2 minutes. Check the Actor runs for failures, then retry.';
		case 'too-many-concurrent-requests':
			return 'Too many requests to this Actor are waiting for a run. Send fewer requests at once.';
		case 'rate-limit-exceeded':
			return 'Your account sent too many requests to Server Actors. Wait, then retry.';
		default:
			break;
	}

	if (status === 504) {
		return 'The Actor did not respond within 5 minutes.';
	}

	return undefined;
}

/**
 * Sends the platform's readiness probe to a locally running Actor until it answers. On the platform, a run that
 * never answers the probe never receives requests, and nothing says why.
 */
export async function watchLocalServerReadiness(port: number, signal: AbortSignal) {
	// 127.0.0.1 reaches both IPv4-only and dual-stack servers; "localhost" may resolve to ::1 first.
	const probeUrl = `http://127.0.0.1:${port}/`;
	const startedAt = Date.now();
	let hasWarned = false;

	while (!signal.aborted) {
		try {
			await fetch(probeUrl, {
				headers: { [READINESS_PROBE_HEADER]: '1' },
				signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
			});
			success({ message: `The Actor server is ready at http://localhost:${port}` });
			return;
		} catch {
			// Not listening yet.
		}

		if (!hasWarned && Date.now() - startedAt > READINESS_PROBE_WARNING_MILLIS) {
			hasWarned = true;
			warning({
				message:
					`No response from http://localhost:${port} after 30 seconds. On the platform, a run receives requests ` +
					`only after it answers GET / with the "${READINESS_PROBE_HEADER}" header.`,
			});
		}

		try {
			await delay(READINESS_PROBE_INTERVAL_MILLIS, undefined, { signal });
		} catch {
			return;
		}
	}
}
