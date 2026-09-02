import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import type { ApifyClient } from 'apify-client';
import { execa } from 'execa';
import open from 'open';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { getConsoleIntegrationsUrl, getConsoleRoutePrefix, getConsoleUrl } from '../console-url.js';
import { useSelectFromList } from '../hooks/user-confirmations/useSelectFromList.js';
import { useUserInput } from '../hooks/user-confirmations/useUserInput.js';
import { info, warning } from '../outputs.js';
import type { AuthJSON } from '../types.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { CONNECT_TIMEOUT_MS, connectViaConsole } from './connectViaConsole.js';

/** Where a new Actor's source code lives. `apify` is the existing, Git-less path. */
export const GIT_SOURCE_CHOICES = ['apify', 'github', 'gitlab', 'bitbucket'] as const;
export type GitSource = (typeof GIT_SOURCE_CHOICES)[number];
export type GitProvider = Exclude<GitSource, 'apify'>;

/**
 * Why the Git wiring stopped short. Each one maps to runnable recovery steps in `buildGitSourceNextSteps`.
 * Everything up to and including `repoCreateFailed` leaves the Actor directory empty — the clone is what
 * puts the template on disk.
 */
export type GitSourceStopReason =
	| 'lookupFailed'
	| 'notAuthorized'
	| 'noWorkspace'
	| 'unknownWorkspace'
	| 'ambiguousWorkspace'
	| 'repoNameRejected'
	| 'repoCreateFailed'
	| 'gitSetupFailed'
	| 'actorCreateFailed'
	| 'deploymentKeyFailed';

export type AutomaticBuilds = 'on' | 'off' | 'failed';

export interface GitSourceResult {
	remoteUrl: string | null;
	/** The clone URL, kept apart from `remoteUrl`: local recovery has no SSH key, the platform does. */
	httpsUrl: string | null;
	actorId: string | null;
	/** The accounts the user can create in, when we got far enough to know them. */
	workspaces: string[] | null;
	stopReason: GitSourceStopReason | null;
	/** Present only when we stopped; null on success. */
	error: string | null;
	/** Whether the clone put the template on disk — false means the Actor directory is still empty. */
	scaffolded: boolean;
	/**
	 * Whether a push to the repository rebuilds the Actor: `off` when it was not asked for or we stopped
	 * before trying, `failed` when the provider refused the webhook.
	 */
	automaticBuilds: AutomaticBuilds;
}

interface GitProviderConfig {
	label: string;
	/**
	 * Set when the CLI can build the authorize URL itself. GitLab and Bitbucket cannot: their CSRF `state`
	 * is minted server-side, so they hand off to Console instead — see `connectViaConsole`.
	 */
	authorize?: {
		endpoint: string;
		defaultClientId: string;
		clientIdEnvVar: string;
		defaultAppName: string;
		appNameEnvVar: string;
		/** `{app}` is replaced with the app name. */
		appInstallUrl: string;
		redirectPath: string;
	};
}

const GIT_PROVIDERS: Record<GitProvider, GitProviderConfig> = {
	github: {
		label: 'GitHub',
		authorize: {
			endpoint: 'https://github.com/login/oauth/authorize',
			defaultClientId: 'Iv1.e39b3ed87e74885f',
			clientIdEnvVar: 'APIFY_GITHUB_APP_CLIENT_ID',
			defaultAppName: 'apify',
			appNameEnvVar: 'APIFY_GITHUB_APP_NAME',
			appInstallUrl: 'https://github.com/apps/{app}/installations/new',
			// Legacy path, and known to be changing — apify-core has a refactor planned for this route.
			redirectPath: '/actors/new/git/connected?service=github',
		},
	},
	gitlab: { label: 'GitLab' },
	bitbucket: { label: 'Bitbucket' },
};

export const isGitProvider = (source: string): source is GitProvider => Object.hasOwn(GIT_PROVIDERS, source);

/**
 * The Apify account the CLI token belongs to, as `auth.json` records it. An organization login is the case
 * that matters: Console completes the exchange as whichever account its own route prefix selects, so
 * without that prefix the grant lands on the personal account behind the organization instead.
 */
export interface GitAccount {
	id?: string;
	username?: string;
	organizationOwnerUserId?: string;
}

/** Narrows the stored login to what the handoff needs, so the token is not carried around with it. */
export const toGitAccount = ({ id, username, organizationOwnerUserId }: AuthJSON): GitAccount => ({
	id,
	username,
	organizationOwnerUserId,
});

/**
 * Where to send a user who has not connected this provider to Apify yet. Providers the CLI cannot
 * authorize itself get the Console page, which is where they connect by hand.
 */
export const getGitConnectUrl = (provider: GitProvider, account?: GitAccount): string => {
	const { authorize } = GIT_PROVIDERS[provider];
	// The Console page acts on the account its route names, so that one has to carry the account itself.
	if (!authorize) return getConsoleIntegrationsUrl(account);

	const redirectUri = new URL(authorize.redirectPath, getConsoleUrl());
	const routePrefix = getConsoleRoutePrefix(account);
	// Encoded twice on purpose, matching Console: it encodes the prefix into the query it builds, and the
	// callback page decodes it once of its own accord before navigating there.
	if (routePrefix) redirectUri.searchParams.set('routePrefix', encodeURIComponent(routePrefix));

	const url = new URL(authorize.endpoint);
	url.searchParams.set('client_id', process.env[authorize.clientIdEnvVar] || authorize.defaultClientId);
	url.searchParams.set('redirect_uri', redirectUri.href);

	return url.href;
};

/**
 * Where to install the app so the user gets a workspace to create repositories in. Only a fallback: the
 * API reports its own `addWorkspaceUrl`, which is preferred wherever it is present.
 */
export const getAddWorkspaceUrl = (provider: GitProvider, account?: GitAccount): string => {
	const { authorize } = GIT_PROVIDERS[provider];
	if (!authorize) return getConsoleIntegrationsUrl(account);

	return authorize.appInstallUrl.replace('{app}', process.env[authorize.appNameEnvVar] || authorize.defaultAppName);
};

/** Final wizard step, mirroring the Console. Skipped when `--source` is passed. */
export const promptGitSource = async (): Promise<GitSource> =>
	useSelectFromList<GitSource>({
		message: 'Where will the source code live?',
		choices: [
			{ name: 'Apify', value: 'apify', description: 'Deploy with "apify push". No Git provider involved.' },
			...GIT_SOURCE_CHOICES.filter(isGitProvider).map((provider) => ({
				name: GIT_PROVIDERS[provider].label,
				value: provider,
				description: `Apify creates a private repository on ${GIT_PROVIDERS[provider].label} and builds the Actor from it.`,
			})),
		],
		default: 'apify',
		loop: false,
	});

/**
 * Splits `--git-repo` into workspace and name. A bare `name` leaves the workspace to be resolved. The
 * name is the part after the last slash: a GitLab subgroup label has slashes of its own.
 */
export const parseGitRepoFlag = (gitRepo: string | undefined, actorName: string) => {
	if (!gitRepo) return { workspace: undefined, repoName: actorName };

	const splitAt = gitRepo.lastIndexOf('/');
	if (splitAt === -1) return { workspace: undefined, repoName: gitRepo };

	const workspace = gitRepo.slice(0, splitAt);
	const repoName = gitRepo.slice(splitAt + 1);
	if (!workspace || !repoName) {
		throw new Error(`Invalid --git-repo "${gitRepo}". Use "workspace/name" or just "name".`);
	}

	return { workspace, repoName };
};

/** The client the command already built, so the token is resolved and the user checked once per run. */
interface ApiCallOptions {
	client: ApifyClient;
}

/** `baseUrl` already ends in `/v2`, matching how `apify api` builds its URLs. */
const apiUrl = ({ client }: ApiCallOptions, path: string) => `${client.baseUrl}/${path}`;

const authHeader = ({ client }: ApiCallOptions) => ({ Authorization: `Bearer ${client.token!}` });

/** A place the user can create a repository in — their own account, or an org/group they can access. */
interface GitWorkspace {
	id: string;
	label: string;
}

/** One connected git-provider integration, as `GET /v2/integrations/git` reports it. */
export interface GitProviderIntegration {
	id: string;
	provider: string;
	workspaces: GitWorkspace[];
	addWorkspaceUrl?: string;
}

/**
 * `GET /v2/integrations/git` — the integrations the user has authorized.
 *
 * Only authorized integrations are listed, so absence from the response is how "not connected" is
 * reported; there is no `isAuthorized` field to read.
 */
const fetchGitIntegrations = async (options: ApiCallOptions): Promise<GitProviderIntegration[]> => {
	const url = apiUrl(options, 'integrations/git');
	cliDebugPrint('git-source', 'GET', url);

	const response = await fetch(url, { headers: authHeader(options) });
	const body = await response.text();
	cliDebugPrint('git-source', 'GET', url, '->', response.status, body.slice(0, 400));

	// An empty list means "nothing connected", so a failed request must not be reported the same way —
	// otherwise a wrong URL or a server error looks exactly like a user who never authorized.
	if (!response.ok) {
		throw new Error(`Could not read your Git integrations (${response.status} ${response.statusText}).`);
	}

	const payload = (() => {
		try {
			return JSON.parse(body) as { data?: GitProviderIntegration[] };
		} catch {
			return null;
		}
	})();

	return payload?.data ?? [];
};

/** A workspace plus the connected account it belongs to, whose id addresses it in every later call. */
export interface ResolvedWorkspace extends GitWorkspace {
	providerId: string;
}

/** What the CLI needs from the listing: whether the provider is connected, and where it can create. */
interface ProviderState {
	connected: boolean;
	workspaces: ResolvedWorkspace[];
	/** The API's own "give Apify access to another account" URL, when it reported one. */
	addWorkspaceUrl?: string;
}

/**
 * Reads the listing once and reduces it to this provider's state.
 *
 * GitHub is one integration holding every account it is installed on. GitLab and Bitbucket report one
 * integration per connected account, so taking the first would hide the rest.
 */
export const readProviderState = (integrations: GitProviderIntegration[], provider: GitProvider): ProviderState => {
	const mine = integrations.filter((integration) => integration.provider === provider);

	return {
		connected: mine.length > 0,
		workspaces: mine.flatMap((integration) =>
			integration.workspaces.map((workspace) => ({ ...workspace, providerId: integration.id })),
		),
		addWorkspaceUrl: mine.find(({ addWorkspaceUrl }) => addWorkspaceUrl)?.addWorkspaceUrl,
	};
};

// Backs off, so the early polls stay fast without costing a request every two seconds for three minutes.
const POLL_INTERVAL_START_MS = 2_000;
const POLL_INTERVAL_MAX_MS = 10_000;
const POLL_TIMEOUT_MS = 3 * 60_000;

/**
 * Polls the listing until the provider has a workspace, the deadline passes, or the caller aborts.
 * Reports the last state it read, so a half-finished grant is not mistaken for a missing one.
 */
const pollForWorkspaces = async (
	load: () => Promise<ProviderState>,
	{
		timeoutMs,
		abortSignal,
		onState,
	}: { timeoutMs: number; abortSignal?: AbortSignal; onState?: (state: ProviderState) => Promise<void> },
): Promise<ProviderState | null> => {
	const deadline = Date.now() + timeoutMs;
	let interval = POLL_INTERVAL_START_MS;
	let state: ProviderState | null = null;

	while (Date.now() < deadline) {
		try {
			await sleep(interval, undefined, { signal: abortSignal });
		} catch {
			return state;
		}

		interval = Math.min(Math.round(interval * 1.5), POLL_INTERVAL_MAX_MS);
		try {
			state = await load();
		} catch (error) {
			// A dropped connection or one 5xx mid-wait is not an answer; the grant may still land.
			cliDebugPrint('git-source', 'poll failed:', error);
			continue;
		}
		if (state.workspaces.length) return state;
		await onState?.(state);
	}

	return state;
};

/**
 * Makes sure the provider is connected and has at least one workspace, opening the browser and polling
 * if not. Nothing comes back to the CLI directly — the browser hands the code to Console — so polling
 * the API is the only way to know it finished. Returns the last state seen when the user never did.
 *
 * Two separate grants are needed: OAuth authorization makes the integration appear at all, while
 * installing the app populates `workspaces`. Authorizing again cannot fix a missing installation, so the
 * two cases open different URLs.
 */
export const ensureUsableIntegration = async (
	provider: GitProvider,
	{ client, isInteractive, account }: ApiCallOptions & { isInteractive: boolean; account?: GitAccount },
): Promise<ProviderState> => {
	const load = async () => readProviderState(await fetchGitIntegrations({ client }), provider);

	let state = await load();
	cliDebugPrint('git-source', 'integrations:', provider, state.connected, `workspaces=${state.workspaces.length}`);
	if (state.workspaces.length) return state;

	// Agents and CI must never be parked on a browser; the caller emits the URL and stops instead.
	if (!isInteractive) return state;

	const { label, authorize } = GIT_PROVIDERS[provider];

	// GitLab and Bitbucket cannot build an authorize URL, so Console starts the flow and reports back.
	if (!state.connected && !authorize) {
		// Console's callback is the fast path, not a guarantee: a user who connects on the page by hand
		// never triggers it, and neither does a Console that predates the hand-off. So watch the listing
		// too, and take whichever arrives first.
		const controller = new AbortController();
		const startedAt = Date.now();
		const handoff = connectViaConsole(provider, label, { abortSignal: controller.signal, account });
		let polled: ProviderState | null;
		try {
			polled = await Promise.race([
				handoff.then(() => null),
				pollForWorkspaces(load, { timeoutMs: CONNECT_TIMEOUT_MS, abortSignal: controller.signal }),
			]);
		} finally {
			// Aborting is what closes the loopback server and clears its timer, so it has to run even when
			// the poll throws — a leaked handle holds the command open until the connect timeout expires.
			controller.abort();
		}

		if (polled?.workspaces.length) return polled;

		const result = await handoff;
		if ('stopReason' in result) {
			warning({ message: result.message });
			return state;
		}

		state = await load();
		if (state.workspaces.length) return state;

		// Console reports the connection as soon as the integration exists, which can be moments before its
		// workspaces are filled in. One empty read is not a missing account, so wait the way the branch
		// below waits for an installation.
		const remainingMs = Math.min(POLL_TIMEOUT_MS, CONNECT_TIMEOUT_MS - (Date.now() - startedAt));
		if (remainingMs < POLL_INTERVAL_START_MS) return state;

		info({ message: `Waiting for Apify to finish connecting your ${label} account...` });
		return (await pollForWorkspaces(load, { timeoutMs: remainingMs })) ?? state;
	}

	// Which grant is missing decides the URL, and authorizing changes the answer: the integration then
	// exists with no workspaces, and only installing the app fills them. So this is re-read every poll,
	// and a URL that has already been opened is never opened twice.
	let openedUrl: string | null = null;
	const offer = async (current: ProviderState) => {
		// The API derives its own URL from an existing installation, so it knows the right one when it has it.
		const url = current.connected
			? (current.addWorkspaceUrl ?? getAddWorkspaceUrl(provider, account))
			: getGitConnectUrl(provider, account);
		if (url === openedUrl) return;
		openedUrl = url;

		const what = current.connected
			? `Give Apify access to a ${label} account`
			: `Connect your ${label} account to Apify`;
		info({ message: `${what}: ${url}` });
		// Printed above as well — a headless session, or a machine with no usable default browser, still needs it.
		await open(url).catch(() => undefined);
		info({
			message: account?.username
				? `Waiting for authorization to complete in your browser. It connects ${label} to the Apify account ${account.username}.`
				: 'Waiting for authorization to complete in your browser...',
		});
	};

	await offer(state);

	return (await pollForWorkspaces(load, { timeoutMs: POLL_TIMEOUT_MS, onState: offer })) ?? state;
};

/**
 * Resolves which workspace to create the repository in. No default when several are connected: the API
 * does not mark which one is the user's own account, and the order is not meaningful.
 */
export const chooseWorkspace = async (
	workspaces: ResolvedWorkspace[],
	requested: string | undefined,
	isInteractive: boolean,
): Promise<
	| { workspace: ResolvedWorkspace }
	| { stopReason: Extract<GitSourceStopReason, 'unknownWorkspace' | 'ambiguousWorkspace'> }
> => {
	if (requested) {
		// Matched against the label as well as the id: GitLab's workspace id is a numeric namespace id,
		// which nobody would type into --git-repo. Provider logins are case-insensitive, so this is too.
		const wanted = requested.toLowerCase();
		const match = workspaces.find(({ id, label }) => id.toLowerCase() === wanted || label.toLowerCase() === wanted);
		return match ? { workspace: match } : { stopReason: 'unknownWorkspace' };
	}

	if (workspaces.length === 1) return { workspace: workspaces[0] };
	if (!isInteractive) return { stopReason: 'ambiguousWorkspace' };

	const workspace = await useSelectFromList<ResolvedWorkspace>({
		message: 'Which account should own the repository?',
		choices: workspaces.map((entry) => ({ name: entry.label, value: entry })),
		loop: false,
	});

	return { workspace };
};

class CreateRemoteRepoError extends Error {
	constructor(
		message: string,
		readonly stopReason: GitSourceStopReason,
	) {
		super(message);
		this.name = 'CreateRemoteRepoError';
	}
}

/** Errors from `create-repo` that mean "send the user through provider authorization again". */
const NEEDS_AUTH = new Set(['integration-auth-error', 'invalid-git-auth-token']);

export interface CreateRemoteRepoOptions extends ApiCallOptions {
	/** The connected account the API addresses: 'github-app', or a per-account integration id. */
	providerId: string;
	workspace: string;
	repoName: string;
	isPrivate: boolean;
	templateArchiveUrl: string;
}

interface CreatedRemoteRepo {
	sshUrl: string;
	httpsUrl: string;
	htmlUrl: string;
}

/**
 * Drops any account name Bitbucket embeds in its clone URL. Git would take it as the username and ask
 * only for a password, which fails for a token whose username is the token's own.
 */
const withoutUserInfo = (url: string): string => {
	if (!URL.canParse(url)) return url;

	const parsed = new URL(url);
	parsed.username = '';
	parsed.password = '';

	return parsed.href;
};

/**
 * Asks the Apify platform to create the repository and seed it with the scaffold. The platform holds the
 * provider credential and reads the template itself, so the CLI handles neither.
 */
const createRemoteRepo = async (options: CreateRemoteRepoOptions): Promise<CreatedRemoteRepo> => {
	const { providerId, workspace, repoName, isPrivate, templateArchiveUrl } = options;

	const url = apiUrl(options, `integrations/git/${providerId}/create-repo`);
	const body = JSON.stringify({ workspace, repoName, isPrivate, templateArchiveUrl });
	cliDebugPrint('git-source', 'POST', url, body);

	const response = await fetch(url, {
		method: 'POST',
		headers: { ...authHeader(options), 'Content-Type': 'application/json' },
		body,
	});

	const raw = await response.text();
	cliDebugPrint('git-source', 'POST', url, '->', response.status, raw.slice(0, 400));

	const payload = (() => {
		try {
			return JSON.parse(raw) as { data?: CreatedRemoteRepo; error?: { type?: string; message?: string } };
		} catch {
			return null;
		}
	})();

	if (response.ok && payload?.data) {
		return { ...payload.data, httpsUrl: withoutUserInfo(payload.data.httpsUrl) };
	}

	const type = payload?.error?.type;
	const message = payload?.error?.message || `${response.status} ${response.statusText}`;

	// 401 and 403 both mean the user has to (re-)authorize: a stored token the provider has since revoked
	// still looks connected on the Apify side, so it only surfaces here.
	if (type && NEEDS_AUTH.has(type)) throw new CreateRemoteRepoError(message, 'notAuthorized');
	if (type === 'invalid-parameter') throw new CreateRemoteRepoError(message, 'repoNameRejected');

	throw new CreateRemoteRepoError(message, 'repoCreateFailed');
};

/**
 * Clones the repository the platform just seeded into `dir`.
 *
 * HTTPS, not SSH: no host-key check, so this works on a machine that has never talked to the provider —
 * including CI, where SSH would stop to verify the host key with nobody there to answer. Repositories are
 * private by default, so the clone does need the user's own provider credentials.
 */
const cloneRepo = async (dir: string, httpsUrl: string, isInteractive: boolean) => {
	// A private repository still needs credentials. Non-interactively, make git fail fast rather than
	// block on a prompt nobody can see.
	const env = isInteractive ? undefined : { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' };

	// `git clone <url> <dir>` accepts an existing empty directory, which is what `apify create` has made.
	await execa('git', ['clone', httpsUrl, dir], { env });
};

/** The single version `createGitActor` makes, and the one the build-on-push webhook is keyed to. */
const GIT_ACTOR_VERSION = '0.0';

const createGitActor = async ({
	client,
	actorName,
	gitRepoUrl,
}: ApiCallOptions & { actorName: string; gitRepoUrl: string }) =>
	client.actors().create({
		name: actorName,
		versions: [
			{
				versionNumber: GIT_ACTOR_VERSION,
				// TODO: export enum from apify-client (same cast as actors/push.ts)
				sourceType: ACTOR_SOURCE_TYPES.GIT_REPO as never,
				gitRepoUrl,
			},
		],
	} as never);

/**
 * Registers the Actor's own read-only deploy key on the repository, so the build worker can clone it over
 * SSH. Without this a private repository cannot be built at all. Console does the same, silently.
 *
 * Runs after `createGitActor`: the key is generated with the Actor, and this endpoint reads it from there.
 */
const registerDeploymentKey = async ({
	client,
	providerId,
	actorId,
	repoUrl,
}: ApiCallOptions & { providerId: string; actorId: string; repoUrl: string }) => {
	const url = apiUrl({ client }, `integrations/git/${providerId}/register-deployment-key`);
	const body = JSON.stringify({ actorId, repoName: repoUrl });
	cliDebugPrint('git-source', 'POST', url, body);

	const response = await fetch(url, {
		method: 'POST',
		headers: { ...authHeader({ client }), 'Content-Type': 'application/json' },
		body,
	});

	const raw = await response.text();
	cliDebugPrint('git-source', 'POST', url, '->', response.status, raw.slice(0, 400));

	if (response.ok) return;

	// The API distinguishes a revoked token, a denied key, a missing repository and a duplicate key, but
	// they all leave the user in one place: no key, so no build. Its own message says which.
	const message = (() => {
		try {
			return (JSON.parse(raw) as { error?: { message?: string } }).error?.message;
		} catch {
			return null;
		}
	})();

	throw new Error(message || `${response.status} ${response.statusText}`);
};

/**
 * `PUT /v2/actors/:id/versions/:v/build-on-push` — registers a push webhook on the repository, so a push
 * rebuilds the Actor. Console calls this "Automatic builds", and leaves it off.
 *
 * The API resolves the provider token from `providerId` itself, so nothing about the repository is passed.
 * Registering a webhook needs admin rights on it, which connecting the account does not, so this is the
 * one platform step a fully connected account can still be refused.
 */
export const enableAutomaticBuilds = async ({
	client,
	providerId,
	actorId,
}: ApiCallOptions & { providerId: string; actorId: string }) => {
	const url = apiUrl({ client }, `actors/${actorId}/versions/${GIT_ACTOR_VERSION}/build-on-push`);
	const body = JSON.stringify({ providerId, enabled: true });
	cliDebugPrint('git-source', 'PUT', url, body);

	const response = await fetch(url, {
		method: 'PUT',
		headers: { ...authHeader({ client }), 'Content-Type': 'application/json' },
		body,
	});

	const raw = await response.text();
	cliDebugPrint('git-source', 'PUT', url, '->', response.status, raw.slice(0, 400));

	if (response.ok) return;

	const message = (() => {
		try {
			return (JSON.parse(raw) as { error?: { message?: string } }).error?.message;
		} catch {
			return null;
		}
	})();

	throw new Error(message || `${response.status} ${response.statusText}`);
};

export interface RunGitSourceFlowOptions extends ApiCallOptions {
	provider: GitProvider;
	actorDir: string;
	actorName: string;
	workspace?: string;
	repoName: string;
	isPrivate: boolean;
	templateArchiveUrl: string;
	isInteractive: boolean;
	/** Whether to register the push webhook, so a push rebuilds the Actor. */
	autoBuild: boolean;
	/** The account the run authorizes as, so an organization login connects the organization. */
	account?: GitAccount;
	/** Local-only setup for the clone. Runs between the clone and the commit, so its changes land in git. */
	customize: (dir: string) => Promise<void>;
}

/**
 * The platform-facing half of the flow: authorize, create and seed the repository, clone it, create the
 * Actor. Never throws — a failure becomes a `stopReason` plus recovery steps.
 */
export const runGitSourceFlow = async ({
	client,
	provider,
	actorDir,
	actorName,
	workspace: requestedWorkspace,
	repoName,
	isPrivate,
	templateArchiveUrl,
	isInteractive,
	account,
	autoBuild,
	customize,
}: RunGitSourceFlowOptions): Promise<GitSourceResult> => {
	let scaffolded = false;

	const stopped = (
		stopReason: GitSourceStopReason,
		err: unknown,
		extra: Partial<GitSourceResult> = {},
	): GitSourceResult => ({
		remoteUrl: null,
		httpsUrl: null,
		actorId: null,
		workspaces: null,
		scaffolded,
		automaticBuilds: 'off',
		...extra,
		stopReason,
		error: err instanceof Error ? err.message : String(err),
	});

	let resolved: ProviderState;
	try {
		resolved = await ensureUsableIntegration(provider, { client, isInteractive, account });
	} catch (err) {
		return stopped('lookupFailed', err);
	}

	const { label } = GIT_PROVIDERS[provider];
	const who = account?.username ? `The Apify account ${account.username}` : 'Apify';
	if (!resolved.connected) {
		return stopped('notAuthorized', new Error(`${who} is not authorized to access your ${label} account.`));
	}
	if (!resolved.workspaces.length) {
		return stopped('noWorkspace', new Error(`${who} has no ${label} account to create the repository in.`));
	}

	// Labels, not ids: GitLab's ids are numeric namespace ids that mean nothing to the user.
	const workspaces = resolved.workspaces.map(({ label }) => label);
	const available = workspaces.join(', ');
	const chosen = await chooseWorkspace(resolved.workspaces, requestedWorkspace, isInteractive);
	if ('stopReason' in chosen) {
		return stopped(
			chosen.stopReason,
			new Error(
				chosen.stopReason === 'unknownWorkspace'
					? `"${requestedWorkspace}" is not one of your connected accounts (${available}).`
					: `Several accounts are connected (${available}); pick one with --git-repo <account>/<name>.`,
			),
			{ workspaces },
		);
	}
	const { workspace } = chosen;

	let repo: CreatedRemoteRepo;
	while (true) {
		try {
			info({
				message: `Creating ${isPrivate ? 'private' : 'public'} repository ${workspace.label}/${repoName} from the template...`,
			});
			repo = await createRemoteRepo({
				client,
				providerId: workspace.providerId,
				workspace: workspace.id,
				repoName,
				isPrivate,
				templateArchiveUrl,
			});
			break;
		} catch (err) {
			// A taken or malformed name is the one failure the user can fix without re-running, and
			// nothing has been created yet — so ask for another name instead of stopping.
			if (err instanceof CreateRemoteRepoError && err.stopReason === 'repoNameRejected' && isInteractive) {
				warning({ message: err.message });
				repoName = await useUserInput({
					message: 'Choose a different repository name:',
					validate: (value) => value.trim().length > 0 || 'Enter a repository name.',
				});
				continue;
			}

			return stopped(err instanceof CreateRemoteRepoError ? err.stopReason : 'repoCreateFailed', err, {
				workspaces,
			});
		}
	}

	// The clone is the only step that needs the user's own provider credentials, and the only one that is
	// purely local. Losing it costs the files, not the Actor, so the error waits until the platform side
	// is finished.
	let cloneError: unknown = null;
	try {
		info({ message: `Cloning ${repo.httpsUrl}...` });
		await cloneRepo(actorDir, repo.httpsUrl, isInteractive);
		scaffolded = true;

		await customize(actorDir);
	} catch (err) {
		// execa leads with its own "Command failed" line and the full argv, burying git's own message,
		// which is the only part that says why.
		const stderr = (err as { stderr?: string }).stderr?.trim();
		cloneError = stderr ? new Error(stderr) : err;
	}

	let actorId: string;
	try {
		// The Actor keeps the SSH URL: what the Console stores, and the platform clones with its own key.
		const actor = await createGitActor({ client, actorName, gitRepoUrl: repo.sshUrl });
		info({ message: `Created Actor ${actor.name} on Apify.` });
		actorId = actor.id;
	} catch (err) {
		return stopped('actorCreateFailed', err, { workspaces, remoteUrl: repo.sshUrl, httpsUrl: repo.httpsUrl });
	}

	try {
		await registerDeploymentKey({ client, providerId: workspace.providerId, actorId, repoUrl: repo.htmlUrl });
	} catch (err) {
		// Everything else landed, so the Actor exists and is reported — it just cannot build yet.
		return stopped('deploymentKeyFailed', err, {
			workspaces,
			remoteUrl: repo.sshUrl,
			httpsUrl: repo.httpsUrl,
			actorId,
		});
	}

	// A webhook is what makes a push rebuild; without it the Actor still builds on demand. So a refusal
	// here costs a convenience, not the run, and the success message says where to turn it on by hand.
	let automaticBuilds: AutomaticBuilds = 'off';
	if (autoBuild) {
		try {
			await enableAutomaticBuilds({ client, providerId: workspace.providerId, actorId });
			automaticBuilds = 'on';
			info({ message: 'Turned on automatic builds.' });
		} catch (err) {
			automaticBuilds = 'failed';
			warning({ message: `Automatic builds stay off: ${err instanceof Error ? err.message : String(err)}` });
		}
	} else {
		info({ message: 'Automatic builds stay off, so a push does not rebuild the Actor.' });
	}

	if (cloneError) {
		return stopped('gitSetupFailed', cloneError, {
			workspaces,
			remoteUrl: repo.sshUrl,
			httpsUrl: repo.httpsUrl,
			actorId,
			automaticBuilds,
		});
	}

	return {
		remoteUrl: repo.sshUrl,
		httpsUrl: repo.httpsUrl,
		actorId,
		workspaces,
		stopReason: null,
		error: null,
		scaffolded: true,
		automaticBuilds,
	};
};

/**
 * The URL that unblocks a stop, when one exists — `gitConnectUrl` in the `--json` payload. Authorization
 * and installation are separate grants, so the two stops resolve to different places.
 */
export const getGitStopUrl = (
	provider: GitProvider,
	stopReason: GitSourceStopReason | null,
	account?: GitAccount,
): string | null => {
	if (stopReason === 'notAuthorized') return getGitConnectUrl(provider, account);
	if (stopReason === 'noWorkspace') return getAddWorkspaceUrl(provider, account);
	return null;
};

export interface GitSourceNextStepsOptions {
	actorName: string;
	/** Only the stop cases live here — a successful run uses the normal `buildNextSteps`. */
	stopReason: GitSourceStopReason;
	provider: GitProvider;
	remoteUrl: string | null;
	/** Recovery runs on the user's machine, which may have no SSH key — so it clones over HTTPS. */
	httpsUrl: string | null;
	repoName: string;
	/** False means the clone never landed, so there is no local repository to recover. */
	scaffolded: boolean;
	/** Set once the Actor exists, so a later stop can link to it. */
	actorId?: string | null;
	account?: GitAccount;
}

/** What to tell the user, or hand an agent in `--json`, once the Git wiring has stopped. */
export const buildGitSourceNextSteps = ({
	actorName,
	stopReason,
	provider,
	remoteUrl,
	httpsUrl,
	repoName,
	scaffolded,
	actorId,
	account,
}: GitSourceNextStepsOptions): string[] => {
	const enter = `cd "${actorName}"`;

	// Everything up to `repoCreateFailed` leaves the directory empty, so those cases re-run in place
	// instead of telling the user to `cd` into it.
	switch (stopReason) {
		case 'lookupFailed':
			return ['Re-run with APIFY_CLI_DEBUG=1 to see the failing request'];
		case 'notAuthorized':
			return [
				`Connect your ${GIT_PROVIDERS[provider].label} account to Apify: ${getGitConnectUrl(provider, account)}`,
				'then re-run apify create',
			];
		case 'noWorkspace':
			return [
				`Give Apify access to a ${GIT_PROVIDERS[provider].label} account: ${getAddWorkspaceUrl(provider, account)}`,
				'then re-run apify create',
			];
		case 'unknownWorkspace':
		case 'ambiguousWorkspace':
			return [`Re-run naming the account: --git-repo <account>/${repoName}`];
		// The provider rejects a taken name and a malformed one the same way, so name both.
		case 'repoNameRejected':
			return [
				`Re-run with a different repository name: --git-repo <account>/<other-name>`,
				'The name has to be free, and to use only letters, numbers, hyphens and underscores',
			];
		case 'repoCreateFailed':
			return ['Re-run apify create to try again'];
		case 'gitSetupFailed':
			// The repository exists either way; only the local half differs. A clone that landed already
			// has its remote, so only its files need a hand. A failed one leaves nothing to attach to.
			return scaffolded
				? [enter, 'Apply the local configuration by hand: the error above says what failed']
				: [
						`git clone ${httpsUrl} "${actorName}"`,
						`Or clone over SSH, if you have a key for the provider: git clone ${remoteUrl} "${actorName}"`,
						enter,
					];
		case 'actorCreateFailed':
			return [enter, `Create an Actor from ${remoteUrl} in Apify Console`];
		// Repository, clone and Actor all landed. Only the build key is missing, and the platform cannot
		// read a private repository without it.
		case 'deploymentKeyFailed':
			return [
				...(scaffolded ? [enter] : [`git clone ${httpsUrl} "${actorName}"`, enter]),
				`Add the Apify deploy key in the Actor's Source settings before building: ${getConsoleUrl()}/actors/${actorId}`,
			];
	}
};

export const logGitSourceOutcome = (result: GitSourceResult, nextSteps: string[]) => {
	if (!result.stopReason) return;

	// This replaces the success banner, so it is the only outcome the user sees. Each headline names what
	// failed rather than the state it left behind.
	const headline = result.scaffolded
		? 'Actor scaffolded, but the Git setup did not finish'
		: result.actorId
			? 'Actor created, but the clone failed'
			: 'The Actor was not created: the Git setup stopped';
	warning({ message: `${headline}: ${result.error}` });
	info({ message: `Next steps:\n${nextSteps.map((step) => `  ${step}`).join('\n')}` });
};
