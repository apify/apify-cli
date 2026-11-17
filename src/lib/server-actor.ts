import { setTimeout as delay } from 'node:timers/promises';

import type { Actor, ActorRunListItem, ApifyClient, Build } from 'apify-client';

import { META_ORIGINS } from '@apify/consts';

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
	ownerUsername: string;
	standbyUrl: string;
	tenancy?: string;
	pricingModel?: string;
	buildRef?: string;
	taggedBuilds: Actor['taggedBuilds'];
	standby: NonNullable<ActorWithServerFields['actorStandby']>;
}

export function isMultiTenant(actor: Pick<ServerActor, 'tenancy'>) {
	return actor.tenancy === 'MULTI_TENANT';
}

/** The pricing record in effect now; the API returns past and scheduled records together. */
export function getEffectivePricingModel(
	pricingInfos: { pricingModel: string; startedAt: Date | string }[] | undefined,
	now = Date.now(),
): string | undefined {
	let effective: { pricingModel: string; startedAt: number } | undefined;

	for (const info of pricingInfos ?? []) {
		const startedAt = new Date(info.startedAt).getTime();

		if (Number.isNaN(startedAt) || startedAt > now) {
			continue;
		}

		if (!effective || startedAt > effective.startedAt) {
			effective = { pricingModel: info.pricingModel, startedAt };
		}
	}

	return effective?.pricingModel;
}

/**
 * Says whose account the runs live in and who pays. A multi-tenant Actor bills its owner and its callers
 * differently, and only a pay-per-event Actor charges the caller events, so neither can be stated without
 * knowing who is asking and how the Actor is priced.
 */
export function describeTenancy(
	actor: Pick<ServerActor, 'tenancy' | 'ownerUsername' | 'pricingModel'>,
	viewerUsername: string | undefined,
): string {
	if (!isMultiTenant(actor)) {
		return `single-tenant (runs in your account "${viewerUsername}", which pays the platform usage)`;
	}

	if (viewerUsername === actor.ownerUsername) {
		return 'multi-tenant (runs in your account; your own requests pay the platform usage, never events)';
	}

	return `multi-tenant (runs in "${actor.ownerUsername}"'s account; ${describeCallerCost(actor.pricingModel)})`;
}

function describeCallerCost(pricingModel: string | undefined): string {
	switch (pricingModel) {
		case 'PAY_PER_EVENT':
			return 'you pay per event';
		case 'PRICE_PER_DATASET_ITEM':
			return 'you pay per dataset item';
		case 'FLAT_PRICE_PER_MONTH':
			return 'your monthly subscription covers it';
		default:
			return "it's free for you";
	}
}

/** The pool that serves the owner's own requests to their multi-tenant Actor. */
const OWNER_PAID_POOL = 'MULTI_TENANT_OWNER_PAID';

/** The pools a multi-tenant Server Actor serves from, in the order the CLI prints them. */
const MULTI_TENANT_POOLS = [
	{ deployment: OWNER_PAID_POOL, label: 'Owner-paid' },
	{ deployment: 'MULTI_TENANT_PAYING_USERS', label: 'Paying users' },
	{ deployment: 'MULTI_TENANT_FREE_USERS', label: 'Free users' },
] as const;

/** Width of the label column in the status output, indented sub-lines included. */
const LABEL_WIDTH = 16;

// apify-client 2.26.0 types `standby` on a full run only; the runs list returns it too.
export type ServerRunListItem = ActorRunListItem & { standby?: { deployment?: string } | null };

export interface ServerRun {
	id: string;
	startedAt: Date;
	/** `standby.deployment` of the run; null when the platform reports no pool. */
	pool: string | null;
}

/**
 * The account whose pool the memory, idle timeout and requests-per-run settings describe. A single-tenant Actor
 * starts a run in the caller's own account, so there is no other account to name and this is undefined.
 */
export function getPoolOwnerUsername(actor: Pick<ServerActor, 'tenancy' | 'ownerUsername'>): string | undefined {
	return isMultiTenant(actor) ? actor.ownerUsername : undefined;
}

/**
 * Keeps the server runs out of the list and records the pool that serves each one. A run of the same Actor started
 * any other way does not serve requests.
 */
export function toServerRuns(items: ServerRunListItem[]): ServerRun[] {
	return items
		.filter((run) => run.meta?.origin === META_ORIGINS.STANDBY)
		.map(({ id, startedAt, standby }) => ({ id, startedAt, pool: standby?.deployment ?? null }));
}

function statusLine(label: string, value: string, indent = 0): string {
	return `${' '.repeat(indent)}${`${label}:`.padEnd(LABEL_WIDTH - indent)}${value}`;
}

/**
 * The memory, idle timeout and requests-per-run block. For a multi-tenant Actor these describe the pool in the
 * owner's account, which a caller neither pays for nor can override, so the block says whose pool it is.
 */
export function describeServerSettings(
	standby: ServerActor['standby'],
	poolOwnerUsername: string | undefined,
	viewerUsername: string | undefined,
): string[] {
	const indent = poolOwnerUsername ? 2 : 0;
	const lines = [
		statusLine('Memory', `${standby.memoryMbytes ?? '-'} MB`, indent),
		statusLine('Idle timeout', `${standby.idleTimeoutSecs ?? '-'} s`, indent),
		statusLine(
			'Requests/run',
			`${standby.desiredRequestsPerActorRun ?? '-'} desired, ${standby.maxRequestsPerActorRun ?? '-'} max`,
			indent,
		),
	];

	if (!poolOwnerUsername) {
		return lines;
	}

	const heading =
		poolOwnerUsername === viewerUsername ? 'Pool in your account:' : `Pool in "${poolOwnerUsername}"'s account:`;

	return [heading, ...lines];
}

/**
 * The `Runs:` block. The owner of a multi-tenant Actor sees the pools broken out, because the pool that serves
 * their own requests is only one of the three. Runs the platform reports under no known pool keep a group of their
 * own, so the groups always account for every run.
 */
export function describeServerRuns(runs: ServerRun[], isPoolOwner: boolean): string[] {
	if (!isPoolOwner) {
		return [
			runs.length > 0
				? statusLine(
						'Runs',
						`${runs.length} running (${runs.map((run) => run.id).join(', ')}); the next request is served warm`,
					)
				: statusLine('Runs', 'none running; the next request starts one (cold start)'),
		];
	}

	const servedWarm = runs.some((run) => run.pool === OWNER_PAID_POOL);
	const warmth = servedWarm ? 'your own requests are served warm' : 'your own requests start one (cold start)';

	if (runs.length === 0) {
		return [statusLine('Runs', `none running; ${warmth}`)];
	}

	const known = new Set<string>(MULTI_TENANT_POOLS.map(({ deployment }) => deployment));
	const groups: { label: string; runs: ServerRun[] }[] = MULTI_TENANT_POOLS.map(({ deployment, label }) => ({
		label,
		runs: runs.filter((run) => run.pool === deployment),
	}));
	const other = runs.filter((run) => !run.pool || !known.has(run.pool));

	if (other.length > 0) {
		groups.push({ label: 'Other', runs: other });
	}

	return [
		statusLine('Runs', `${runs.length} running; ${warmth}`),
		...groups.map((group) =>
			statusLine(
				group.label,
				group.runs.length > 0 ? `${group.runs.length} (${group.runs.map((run) => run.id).join(', ')})` : 'none',
				2,
			),
		),
	];
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
		ownerUsername: actor.username,
		standbyUrl: actor.standbyUrl,
		tenancy: actor.actorStandby.tenancy,
		pricingModel: getEffectivePricingModel(actor.pricingInfos),
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
		const parsedType = (JSON.parse(body) as { error?: { type?: unknown } } | null)?.error?.type;
		type = typeof parsedType === 'string' ? parsedType : undefined;
	} catch {
		// Not a router error body; the Actor answered.
	}

	const isRouterError = type !== undefined;

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

	// An Actor can answer 504 itself, instantly; only the router's own timeout means it went silent.
	if (status === 504 && (isRouterError || !body.trim())) {
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
