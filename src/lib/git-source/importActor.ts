import { existsSync } from 'node:fs';
import process from 'node:process';

import type { Actor, ApifyClient } from 'apify-client';
import { execa } from 'execa';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { getConsoleUrl } from '../console-url.js';
import { CommandExitCodes, EMPTY_LOCAL_CONFIG } from '../consts.js';
import { useActorConfig } from '../hooks/useActorConfig.js';
import { useYesNoConfirm } from '../hooks/user-confirmations/useYesNoConfirm.js';
import { info, success, warning } from '../outputs.js';
import {
	getCurrentUserInfo,
	getLoggedClientOrThrow,
	printJsonToStdout,
	setLocalConfig,
	validateActorName,
} from '../utils.js';
import {
	type AutomaticBuilds,
	enableAutomaticBuilds,
	ensureUsableIntegration,
	getAddWorkspaceUrl,
	type GitProvider,
	registerDeploymentKey,
	toGitAccount,
} from './gitSource.js';

export const IMPORT_SOURCE_CHOICES = ['git', 'none'] as const;
export type ImportSource = (typeof IMPORT_SOURCE_CHOICES)[number];

const DEFAULT_VERSION_NUMBER = '0.0';

const PROVIDER_HOSTS: Record<string, GitProvider> = {
	'github.com': 'github',
	'gitlab.com': 'gitlab',
	'bitbucket.org': 'bitbucket',
};

interface GitRemote {
	provider: GitProvider;
	/** `owner/repo`, or `group/subgroup/repo` on GitLab. */
	path: string;
	/** The form Console stores. The platform clones it with the Actor's deploy key, public or private. */
	sshUrl: string;
	/** What `register-deployment-key` takes as `repoName`. */
	webUrl: string;
}

/**
 * Reads an `origin` URL in any form Git accepts for the three hosted providers. Credentials embedded in an
 * HTTPS remote are dropped: nothing derived from it may carry them.
 */
export const parseGitRemote = (remote: string): GitRemote | null => {
	let host: string;
	let path: string;

	if (remote.includes('://')) {
		if (!URL.canParse(remote)) return null;
		({ hostname: host, pathname: path } = new URL(remote));
	} else {
		// scp-like syntax: [user@]host:path
		const match = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(remote);
		if (!match) return null;
		[, host, path] = match;
	}

	host = host.toLowerCase();
	path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');

	const provider = PROVIDER_HOSTS[host];
	if (!provider || !path.includes('/')) return null;

	return { provider, path, sshUrl: `git@${host}:${path}.git`, webUrl: `https://${host}/${path}` };
};

/** `<url>#<branch>`, plus `:<folder>` below the repository root — the form a version's `gitRepoUrl` takes. */
const buildGitRepoUrl = (sshUrl: string, branch: string, folder: string) =>
	`${sshUrl}#${branch}${folder ? `:${folder}` : ''}`;

const git = async (dir: string, args: string[]) => (await execa('git', args, { cwd: dir })).stdout.trim();

/** Null outside a working copy. `--show-prefix` gives the folder with `/` separators on every platform. */
const readWorkingCopy = async (dir: string) => {
	let prefix: string;
	try {
		prefix = await git(dir, ['rev-parse', '--show-prefix']);
	} catch {
		return null;
	}

	return {
		folder: prefix.replace(/\/$/, ''),
		remote: await git(dir, ['remote', 'get-url', 'origin']).catch(() => null),
		// Empty on a detached HEAD, which names no branch to build from.
		branch: await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => ''),
	};
};

class ImportInputError extends Error {}

export interface RunImportOptions {
	dir: string;
	/** A name for the Actor to create or link; defaults to the one in `actor.json`. */
	name?: string;
	/** An existing Actor to link, by ID or name. */
	actor?: string;
	/** Omitted means `git` when the directory has a supported `origin`, `none` otherwise. */
	source?: ImportSource;
	/** Set by `apify create --source <provider> --import`: the remote has to be on that provider. */
	provider?: GitProvider;
	/** How the caller's `--source` spells `none`; `apify create` calls it `apify`. */
	noneSourceValue?: string;
	branch?: string;
	autoBuild?: string;
	force: boolean;
	json: boolean;
	isInteractive: boolean;
}

/** `username/name`, or a bare name under the logged-in account. Only `--actor` may also be an ID. */
const findActor = async (
	client: ApifyClient,
	{ target, username, maybeId }: { target: string; username: string; maybeId: boolean },
): Promise<Actor | undefined> => {
	if (target.includes('/')) return client.actor(target).get();

	return (await client.actor(`${username}/${target}`).get()) ?? (maybeId ? client.actor(target).get() : undefined);
};

const confirmSourceSwitch = async ({
	actorName,
	from,
	to,
	force,
	isInteractive,
}: {
	actorName: string;
	from: string;
	to: string;
	force: boolean;
	isInteractive: boolean;
}) => {
	warning({ message: `Actor ${actorName} builds from ${from}. Importing switches it to ${to}.` });
	if (force) return true;

	if (!isInteractive) {
		throw new ImportInputError(`Actor ${actorName} already builds from another Git source. To switch it, use --force.`);
	}

	return useYesNoConfirm({ message: 'Switch the Git source?', default: false });
};

const importActor = async ({
	dir,
	name,
	actor: actorFlag,
	source,
	provider,
	noneSourceValue = 'none',
	branch: branchFlag,
	autoBuild,
	force,
	json,
	isInteractive,
}: RunImportOptions) => {
	if (name && actorFlag) {
		throw new ImportInputError('Pass either an Actor name or --actor, not both.');
	}

	if (!existsSync(dir)) {
		throw new ImportInputError(`${dir} does not exist.`);
	}

	const actorConfigResult = await useActorConfig({ cwd: dir });
	if (actorConfigResult.isErr()) {
		process.exitCode = CommandExitCodes.InvalidActorJson;
		throw actorConfigResult.unwrapErr();
	}
	const { config: localConfig } = actorConfigResult.unwrap();

	const target = actorFlag ?? name ?? (localConfig?.name as string | undefined);
	if (!target) {
		throw new ImportInputError(
			'No Actor to import into. Pass a name ("apify import my-actor"), link one with --actor, or run "apify init" first.',
		);
	}

	if (!actorFlag) validateActorName(target);

	const workingCopy = source === 'none' ? null : await readWorkingCopy(dir);
	const remote = workingCopy?.remote ? parseGitRemote(workingCopy.remote) : null;

	if (source === 'git' && !remote) {
		throw new ImportInputError(
			// The remote itself is not echoed: an HTTPS one can carry a token.
			workingCopy?.remote
				? `The origin remote is not on GitHub, GitLab, or Bitbucket. Use --source ${noneSourceValue} to bind the Actor without a Git source.`
				: `${dir} is not in a Git repository with an origin remote. Use --source ${noneSourceValue} to bind the Actor without a Git source.`,
		);
	}

	if (!remote && (branchFlag || autoBuild)) {
		throw new ImportInputError('--branch and --auto-build only apply to a Git source, so drop them.');
	}

	if (remote && provider && remote.provider !== provider) {
		throw new ImportInputError(`The origin remote is on ${remote.provider}, not ${provider}.`);
	}

	const branch = branchFlag || workingCopy?.branch;
	if (remote && !branch) {
		throw new ImportInputError('HEAD is detached, so there is no branch to build from. Pass --branch <name>.');
	}

	const gitRepoUrl = remote ? buildGitRepoUrl(remote.sshUrl, branch!, workingCopy!.folder) : null;

	const client = await getLoggedClientOrThrow();
	const userInfo = await getCurrentUserInfo();
	const account = toGitAccount(userInfo);

	// Resolved before the Actor is touched, so a missing grant leaves nothing half-wired on the platform.
	let providerId: string | null = null;
	if (remote) {
		const state = await ensureUsableIntegration(remote.provider, { client, isInteractive, account });
		const owner = remote.path.slice(0, remote.path.lastIndexOf('/')).toLowerCase();
		// GitLab names a subgroup by its full path or by its top-level group, depending on where Apify was installed.
		const owners = [owner, owner.split('/')[0]];
		const workspace = owners
			.map((wanted) => state.workspaces.find(({ id, label }) => [id, label].some((v) => v.toLowerCase() === wanted)))
			.find(Boolean);

		if (!workspace) {
			throw new Error(
				`Apify has no access to ${owner} on ${remote.provider}. Give it access, then re-run: ${state.addWorkspaceUrl ?? getAddWorkspaceUrl(remote.provider, account)}`,
			);
		}

		providerId = workspace.providerId;
	}

	const versionNumber = (localConfig?.version as string | undefined) || DEFAULT_VERSION_NUMBER;
	// What actor.json says once it is written below, so a new version gets the tag the file claims.
	const buildTag = (localConfig?.buildTag as string | undefined) ?? EMPTY_LOCAL_CONFIG.buildTag;
	const gitVersion = { sourceType: ACTOR_SOURCE_TYPES.GIT_REPO as never, gitRepoUrl: gitRepoUrl! };

	let actor = await findActor(client, { target, username: userInfo.username || userInfo.id!, maybeId: !!actorFlag });
	if (!actor && actorFlag) {
		throw new ImportInputError(`Cannot find Actor "${actorFlag}" in your account.`);
	}

	// Set when the Actor already built from this repository, so its deploy key is in place.
	let sameRepository = false;
	// Set when there is no Git source to bind but the version already builds from one, which import leaves in place.
	let keptGitRepoUrl: string | null = null;

	if (!actor) {
		actor = await client.actors().create({
			name: target,
			versions: [
				remote
					? { versionNumber, buildTag, ...gitVersion }
					: { versionNumber, buildTag, sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES as never, sourceFiles: [] },
			],
		} as never);
		info({ message: `Created Actor ${actor.name} on Apify.` });
	} else if (remote) {
		const versionClient = client.actor(actor.id).version(versionNumber);
		const current = await versionClient.get();
		const currentUrl = current?.sourceType === ACTOR_SOURCE_TYPES.GIT_REPO ? current.gitRepoUrl : null;
		const [currentRepo = '', currentRef] = currentUrl?.split('#') ?? [];
		sameRepository = currentRepo === remote.sshUrl;
		// Console stores a public repository in HTTPS form, so the same source can be spelled two ways.
		const currentSource = `${parseGitRemote(currentRepo)?.sshUrl ?? currentRepo}#${currentRef}`;

		if (
			currentUrl &&
			currentSource !== gitRepoUrl &&
			!(await confirmSourceSwitch({ actorName: actor.name, from: currentUrl, to: gitRepoUrl!, force, isInteractive }))
		) {
			info({ message: `Import aborted. Actor ${actor.name} still builds from ${currentUrl}.` });
			return;
		}

		if (current) {
			await versionClient.update(gitVersion);
		} else {
			await client
				.actor(actor.id)
				.versions()
				.create({ versionNumber, buildTag, ...gitVersion });
		}
	} else {
		const current = await client.actor(actor.id).version(versionNumber).get();
		if (current?.sourceType === ACTOR_SOURCE_TYPES.GIT_REPO) keptGitRepoUrl = current.gitRepoUrl;
	}

	// Written after the Actor changed, so the next push does not see it as newer than every local file.
	await setLocalConfig({ ...EMPTY_LOCAL_CONFIG, ...localConfig, name: actor.name }, dir);

	// Push looks the Actor up under the logged-in account, so it misses one that belongs to someone else.
	if (actor.username && userInfo.username && actor.username !== userInfo.username) {
		warning({
			message: `Actor ${actor.username}/${actor.name} is not yours, so push it with "apify push ${actor.id}".`,
		});
	}

	const actorUrl = `${getConsoleUrl()}${userInfo.organizationOwnerUserId ? `/organization/${userInfo.id}` : ''}/actors/${actor.id}`;

	if (keptGitRepoUrl) {
		warning({
			message: `Actor ${actor.name} still builds from ${keptGitRepoUrl}. "apify push" asks before replacing that source with the local files.`,
		});
	}

	let automaticBuilds: AutomaticBuilds = 'off';
	if (remote) {
		if (!sameRepository) {
			try {
				await registerDeploymentKey({ client, providerId: providerId!, actorId: actor.id, repoUrl: remote.webUrl });
			} catch (err) {
				process.exitCode = 1;
				throw new Error(
					`Actor ${actor.name} builds from ${gitRepoUrl}, but its deploy key could not be added to the repository: ${(err as Error).message}\nAdd it in the Actor's Source settings before building: ${actorUrl}`,
				);
			}
		}

		if (autoBuild !== 'off') {
			try {
				await enableAutomaticBuilds({ client, providerId: providerId!, actorId: actor.id, versionNumber });
				automaticBuilds = 'on';
			} catch (err) {
				automaticBuilds = 'failed';
				warning({ message: `Automatic builds stay off: ${(err as Error).message}` });
			}
		}
	}

	if (json) {
		printJsonToStdout({
			actor: { id: actor.id, name: actor.name, url: actorUrl },
			source: remote
				? { type: 'git', gitRepoUrl, versionNumber, automaticBuilds }
				: keptGitRepoUrl
					? { type: 'git', gitRepoUrl: keptGitRepoUrl, versionNumber }
					: { type: 'none' },
		});
		return;
	}

	success({
		message: [
			`Actor ${actor.name} is bound to ${dir}: ${actorUrl}`,
			remote
				? `It builds from ${gitRepoUrl}. ${automaticBuilds === 'on' ? 'A git push rebuilds it.' : 'Build it with "apify builds create", or turn on automatic builds in the Actor\'s Source settings.'}`
				: !keptGitRepoUrl && 'Deploy it with "apify push".',
		]
			.filter(Boolean)
			.join('\n'),
	});
};

/** `apify import` and `apify create --import`: binds a directory to an Actor, and the Actor to its Git source. */
export const runImport = async (options: RunImportOptions) => {
	try {
		await importActor(options);
	} catch (err) {
		// Every input error is caught before anything on the platform changes.
		if (err instanceof ImportInputError) process.exitCode = CommandExitCodes.InvalidInput;
		throw err;
	}
};
