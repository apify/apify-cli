import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import type { ApifyClient } from 'apify-client';
import { execa } from 'execa';
import open from 'open';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { getConsoleUrl } from '../console-url.js';
import { useSelectFromList } from '../hooks/user-confirmations/useSelectFromList.js';
import { info, warning } from '../outputs.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';

/** Where a new Actor's source code lives. `apify` is the existing, Git-less path. */
export const GIT_SOURCE_CHOICES = ['apify', 'github'] as const;
export type GitSource = (typeof GIT_SOURCE_CHOICES)[number];
export type GitProvider = Exclude<GitSource, 'apify'>;

export const isGitProvider = (source: string): source is GitProvider => source === 'github';

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
	| 'repoNameTaken'
	| 'repoCreateFailed'
	| 'gitSetupFailed'
	| 'actorCreateFailed';

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
}

interface GitProviderConfig {
	providerId: string;
	authorizeEndpoint: string;
	defaultClientId: string;
	clientIdEnvVar: string;
	defaultAppName: string;
	appNameEnvVar: string;
	/** `{app}` is replaced with the app name. */
	appInstallUrl: string;
	redirectPath: string;
}

/**
 * Per-provider OAuth details. The CLI builds the authorize URL itself: the client id is public, while the
 * client secret and the access token never leave the platform. Both values differ per environment.
 *
 * `providerId` is the id the API addresses the integration by — synthetic for GitHub, whose App is a
 * single per-user connection rather than a `UserIntegration` document.
 */
const GIT_PROVIDERS = {
	github: {
		providerId: 'github-app',
		authorizeEndpoint: 'https://github.com/login/oauth/authorize',
		defaultClientId: 'Iv1.e39b3ed87e74885f',
		clientIdEnvVar: 'APIFY_GITHUB_APP_CLIENT_ID',
		defaultAppName: 'apify',
		appNameEnvVar: 'APIFY_GITHUB_APP_NAME',
		appInstallUrl: 'https://github.com/apps/{app}/installations/new',
		// Legacy path, and known to be changing — apify-core has a refactor planned for this route.
		redirectPath: '/actors/new/git/connected?service=github',
	},
} satisfies Record<GitProvider, GitProviderConfig>;

/** Where to send a user who has not connected this provider to Apify yet. */
export const getGitConnectUrl = (provider: GitProvider) => {
	const { authorizeEndpoint, defaultClientId, clientIdEnvVar, redirectPath } = GIT_PROVIDERS[provider];

	const redirectUri = new URL(redirectPath, getConsoleUrl());

	const url = new URL(authorizeEndpoint);
	url.searchParams.set('client_id', process.env[clientIdEnvVar] || defaultClientId);
	url.searchParams.set('redirect_uri', redirectUri.href);

	return url.href;
};

/**
 * Where to install the app so the user gets a workspace to create repositories in. The API's own
 * `addWorkspaceUrl` is derived from an existing installation, so it is absent in the case that needs it.
 */
export const getAddWorkspaceUrl = (provider: GitProvider) => {
	const { defaultAppName, appNameEnvVar, appInstallUrl } = GIT_PROVIDERS[provider];
	return appInstallUrl.replace('{app}', process.env[appNameEnvVar] || defaultAppName);
};

/** Final wizard step, mirroring the Console. Skipped when `--source` is passed. */
export const promptGitSource = async (): Promise<GitSource> =>
	useSelectFromList<GitSource>({
		message: 'Where will the source code live?',
		choices: [
			{ name: 'Apify', value: 'apify', description: 'Deploy with "apify push". No Git provider involved.' },
			{
				name: 'GitHub',
				value: 'github',
				description:
					'Apify creates a private repository and builds the Actor from it. Add --git-public for a public one.',
			},
		],
		default: 'apify',
		loop: false,
	});

/** Splits `--git-repo` into workspace and name. A bare `name` leaves the workspace to be resolved. */
export const parseGitRepoFlag = (gitRepo: string | undefined, actorName: string) => {
	if (!gitRepo) return { workspace: undefined, repoName: actorName };

	const [first, second, ...rest] = gitRepo.split('/');
	if (rest.length > 0 || (second !== undefined && (!first || !second))) {
		throw new Error(`Invalid --git-repo "${gitRepo}". Use "workspace/name" or just "name".`);
	}

	return second === undefined ? { workspace: undefined, repoName: first } : { workspace: first, repoName: second };
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

const findIntegration = (integrations: GitProviderIntegration[], provider: GitProvider) =>
	integrations.find((integration) => integration.id === GIT_PROVIDERS[provider].providerId);

// Backs off, so the early polls stay fast without costing a request every two seconds for three minutes.
const POLL_INTERVAL_START_MS = 2_000;
const POLL_INTERVAL_MAX_MS = 10_000;
const POLL_TIMEOUT_MS = 3 * 60_000;

/**
 * Makes sure the provider is connected and has at least one workspace, opening the browser and polling
 * if not. Nothing comes back to the CLI directly — the browser hands the code to Console — so polling
 * the API is the only way to know it finished. Returns null when the user never did.
 *
 * Two separate grants are needed: OAuth authorization makes the integration appear at all, while
 * installing the app populates `workspaces`. Authorizing again cannot fix a missing installation, so the
 * two cases open different URLs.
 */
const ensureUsableIntegration = async (
	provider: GitProvider,
	{ client, isInteractive }: ApiCallOptions & { isInteractive: boolean },
): Promise<GitProviderIntegration | null> => {
	const load = async () => findIntegration(await fetchGitIntegrations({ client }), provider);

	let integration = await load();
	cliDebugPrint(
		'git-source',
		'integration:',
		integration ? `${integration.id} workspaces=${integration.workspaces.length}` : 'none',
	);
	if (integration?.workspaces.length) return integration;

	// Agents and CI must never be parked on a browser; the caller emits the URL and stops instead.
	if (!isInteractive) return integration ?? null;

	const url = integration ? integration.addWorkspaceUrl || getAddWorkspaceUrl(provider) : getGitConnectUrl(provider);
	const what = integration ? `Give Apify access to a ${provider} account` : `Connect your ${provider} account to Apify`;

	info({ message: `${what}: ${url}` });
	// Printed above as well — a headless session, or a machine with no usable default browser, still needs it.
	await open(url).catch(() => undefined);
	info({ message: 'Waiting for authorization to complete in your browser...' });

	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let interval = POLL_INTERVAL_START_MS;
	while (Date.now() < deadline) {
		await sleep(interval);
		interval = Math.min(Math.round(interval * 1.5), POLL_INTERVAL_MAX_MS);
		integration = await load();
		if (integration?.workspaces.length) return integration;
	}

	return integration ?? null;
};

/**
 * Resolves which workspace to create the repository in. No default when several are connected: the API
 * does not mark which one is the user's own account, and the order is not meaningful.
 */
export const chooseWorkspace = async (
	integration: GitProviderIntegration,
	requested: string | undefined,
	isInteractive: boolean,
): Promise<
	{ workspace: string } | { stopReason: Extract<GitSourceStopReason, 'unknownWorkspace' | 'ambiguousWorkspace'> }
> => {
	const { workspaces } = integration;

	if (requested) {
		const match = workspaces.find(({ id }) => id.toLowerCase() === requested.toLowerCase());
		return match ? { workspace: match.id } : { stopReason: 'unknownWorkspace' };
	}

	if (workspaces.length === 1) return { workspace: workspaces[0].id };
	if (!isInteractive) return { stopReason: 'ambiguousWorkspace' };

	const workspace = await useSelectFromList<string>({
		message: 'Which account should own the repository?',
		choices: workspaces.map(({ id, label }) => ({ name: label, value: id })),
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
	provider: GitProvider;
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
 * Asks the Apify platform to create the repository and seed it with the scaffold. The platform holds the
 * provider credential and reads the template itself, so the CLI handles neither.
 */
const createRemoteRepo = async (options: CreateRemoteRepoOptions): Promise<CreatedRemoteRepo> => {
	const { provider, workspace, repoName, isPrivate, templateArchiveUrl } = options;
	const { providerId } = GIT_PROVIDERS[provider];

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

	if (response.ok && payload?.data) return payload.data;

	const type = payload?.error?.type;
	const message = payload?.error?.message || `${response.status} ${response.statusText}`;

	// 401 and 403 both mean the user has to (re-)authorize: a stored token the provider has since revoked
	// still looks connected on the Apify side, so it only surfaces here.
	if (type && NEEDS_AUTH.has(type)) throw new CreateRemoteRepoError(message, 'notAuthorized');
	if (type === 'invalid-parameter') throw new CreateRemoteRepoError(message, 'repoNameTaken');

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

const createGitActor = async ({
	client,
	actorName,
	gitRepoUrl,
}: ApiCallOptions & { actorName: string; gitRepoUrl: string }) =>
	client.actors().create({
		name: actorName,
		versions: [
			{
				versionNumber: '0.0',
				// TODO: export enum from apify-client (same cast as actors/push.ts)
				sourceType: ACTOR_SOURCE_TYPES.GIT_REPO as never,
				gitRepoUrl,
			},
		],
	} as never);

export interface RunGitSourceFlowOptions extends ApiCallOptions {
	provider: GitProvider;
	actorDir: string;
	actorName: string;
	workspace?: string;
	repoName: string;
	isPrivate: boolean;
	templateArchiveUrl: string;
	isInteractive: boolean;
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
		...extra,
		stopReason,
		error: err instanceof Error ? err.message : String(err),
	});

	let integration: GitProviderIntegration | null;
	try {
		integration = await ensureUsableIntegration(provider, { client, isInteractive });
	} catch (err) {
		return stopped('lookupFailed', err);
	}

	if (!integration) {
		return stopped('notAuthorized', new Error(`Apify is not authorized to access your ${provider} account.`));
	}
	if (!integration.workspaces.length) {
		return stopped('noWorkspace', new Error(`Apify has no ${provider} account to create the repository in.`));
	}

	const workspaces = integration.workspaces.map(({ id }) => id);
	const available = workspaces.join(', ');
	const chosen = await chooseWorkspace(integration, requestedWorkspace, isInteractive);
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
	try {
		repo = await createRemoteRepo({
			client,
			provider,
			workspace,
			repoName,
			isPrivate,
			templateArchiveUrl,
		});
		info({
			message: `Created ${isPrivate ? 'private' : 'public'} repository ${workspace}/${repoName} from the template.`,
		});
	} catch (err) {
		const stopReason = err instanceof CreateRemoteRepoError ? err.stopReason : 'repoCreateFailed';
		return stopped(stopReason, err, { workspaces });
	}

	try {
		await cloneRepo(actorDir, repo.httpsUrl, isInteractive);
		info({ message: `Cloned ${repo.httpsUrl}.` });
		scaffolded = true;

		await customize(actorDir);
	} catch (err) {
		return stopped('gitSetupFailed', err, { workspaces, remoteUrl: repo.sshUrl, httpsUrl: repo.httpsUrl });
	}

	try {
		// The Actor keeps the SSH URL: what the Console stores, and the platform clones with its own key.
		const actor = await createGitActor({ client, actorName, gitRepoUrl: repo.sshUrl });
		info({ message: `Created Actor ${actor.name} on Apify.` });
		return {
			remoteUrl: repo.sshUrl,
			httpsUrl: repo.httpsUrl,
			actorId: actor.id,
			workspaces,
			stopReason: null,
			error: null,
			scaffolded: true,
		};
	} catch (err) {
		return stopped('actorCreateFailed', err, { workspaces, remoteUrl: repo.sshUrl, httpsUrl: repo.httpsUrl });
	}
};

/**
 * The URL that unblocks a stop, when one exists — `gitConnectUrl` in the `--json` payload. Authorization
 * and installation are separate grants, so the two stops resolve to different places.
 */
export const getGitStopUrl = (provider: GitProvider, stopReason: GitSourceStopReason | null): string | null => {
	if (stopReason === 'notAuthorized') return getGitConnectUrl(provider);
	if (stopReason === 'noWorkspace') return getAddWorkspaceUrl(provider);
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
}: GitSourceNextStepsOptions): string[] => {
	const enter = `cd "${actorName}"`;

	// Everything up to `repoCreateFailed` leaves the directory empty, so those cases re-run in place
	// instead of telling the user to `cd` into it.
	switch (stopReason) {
		case 'lookupFailed':
			return ['Re-run with APIFY_CLI_DEBUG=1 to see the failing request'];
		case 'notAuthorized':
			return [`Connect your ${provider} account to Apify: ${getGitConnectUrl(provider)}`, 'then re-run apify create'];
		case 'noWorkspace':
			return [`Give Apify access to an account: ${getAddWorkspaceUrl(provider)}`, 'then re-run apify create'];
		case 'unknownWorkspace':
		case 'ambiguousWorkspace':
			return [`Re-run naming the account: --git-repo <account>/${repoName}`];
		case 'repoNameTaken':
			return [`Re-run with a free repository name: --git-repo <account>/<other-name>`];
		case 'repoCreateFailed':
			return ['Re-run apify create to try again'];
		case 'gitSetupFailed':
			// The repository exists either way; only the local half differs. A clone that landed already
			// has its remote, so only its files need a hand. A failed one leaves nothing to attach to.
			return scaffolded
				? [enter, 'Apply the local configuration by hand: the error above says what failed']
				: [`git clone ${httpsUrl} "${actorName}"`, enter];
		case 'actorCreateFailed':
			return [enter, `Create an Actor from ${remoteUrl} in Apify Console`];
	}
};

export const logGitSourceOutcome = (result: GitSourceResult, nextSteps: string[]) => {
	if (!result.stopReason) return;

	// This replaces the success banner, so it is the only outcome the user sees.
	const headline = result.scaffolded
		? 'Actor scaffolded, but the Git setup did not finish'
		: 'The Actor was not created: the Git setup stopped';
	warning({ message: `${headline}: ${result.error}` });
	info({ message: `Next steps:\n${nextSteps.map((step) => `  ${step}`).join('\n')}` });
};
