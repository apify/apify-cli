import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectViaConsole } from '../../../src/lib/git-source/connectViaConsole.js';
import {
	buildGitSourceNextSteps,
	getAddWorkspaceUrl,
	getGitConnectUrl,
	getGitStopUrl,
	type GitProviderIntegration,
	type ResolvedWorkspace,
	type GitSourceResult,
	isGitProvider,
	logGitSourceOutcome,
	parseGitRepoFlag,
	runGitSourceFlow,
	chooseWorkspace,
	readProviderState,
	ensureUsableIntegration,
	enableAutomaticBuilds,
} from '../../../src/lib/git-source/gitSource.js';
import { useUserInput } from '../../../src/lib/hooks/user-confirmations/useUserInput.js';

vi.mock('../../../src/lib/hooks/user-confirmations/useUserInput.js', () => ({
	useUserInput: vi.fn(),
}));

const useUserInputMock = vi.mocked(useUserInput);

beforeEach(() => {
	useUserInputMock.mockReset();
});

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));
// The poll's backoff is not what these tests are about, and Vitest's fake timers do not reach
// `node:timers/promises`. Keeping the abort behavior is what matters: the poll gives up on it.
vi.mock('node:timers/promises', () => ({
	setTimeout: (_ms: number, value?: unknown, { signal }: { signal?: AbortSignal } = {}) =>
		new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason);
				return;
			}

			signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
			setImmediate(() => resolve(value));
		}),
}));
vi.mock('../../../src/lib/git-source/connectViaConsole.js', () => ({
	CONNECT_TIMEOUT_MS: 5 * 60_000,
	// Stands in for a Console that never calls back, which is what the polling fallback is for.
	connectViaConsole: vi.fn(() => new Promise(() => {})),
}));

const connectViaConsoleMock = vi.mocked(connectViaConsole);

describe('parseGitRepoFlag', () => {
	it('falls back to the Actor name and an unset workspace when the flag is omitted', () => {
		expect(parseGitRepoFlag(undefined, 'my-scraper')).toEqual({ workspace: undefined, repoName: 'my-scraper' });
	});

	it('treats a bare value as a repo name, leaving the workspace to be resolved', () => {
		expect(parseGitRepoFlag('other-name', 'my-scraper')).toEqual({ workspace: undefined, repoName: 'other-name' });
	});

	it('splits workspace/name', () => {
		expect(parseGitRepoFlag('acme-inc/my-scraper', 'ignored')).toEqual({
			workspace: 'acme-inc',
			repoName: 'my-scraper',
		});
	});

	// A GitLab subgroup label has slashes of its own, so only the last segment is the name.
	it('keeps a subgroup path together as the workspace', () => {
		expect(parseGitRepoFlag('my-group/sub/my-scraper', 'ignored')).toEqual({
			workspace: 'my-group/sub',
			repoName: 'my-scraper',
		});
	});

	it.each(['acme-inc/', '/my-scraper'])('rejects %s', (value) => {
		expect(() => parseGitRepoFlag(value, 'my-scraper')).toThrow(/Use "workspace\/name" or just "name"/);
	});
});

describe('isGitProvider', () => {
	it('separates the Git-backed sources from the default one', () => {
		expect(isGitProvider('github')).toBe(true);
		expect(isGitProvider('gitlab')).toBe(true);
		expect(isGitProvider('bitbucket')).toBe(true);
		expect(isGitProvider('apify')).toBe(false);
	});

	it('rejects a source that is not a choice at all', () => {
		expect(isGitProvider('gitea')).toBe(false);
	});
});

// GitLab and Bitbucket mint their CSRF state server-side, so the CLI cannot build either URL for them
// and hands off to Console instead.
describe('providers the CLI cannot authorize itself', () => {
	it.each(['gitlab', 'bitbucket'] as const)('sends %s to the Console integrations page', (provider) => {
		expect(getGitConnectUrl(provider)).toBe('https://console.apify.com/settings/integrations');
		expect(getAddWorkspaceUrl(provider)).toBe('https://console.apify.com/settings/integrations');
	});

	// The Console page acts on the account its route names, so a bare URL can connect an account the CLI's
	// token cannot see — and every later build reads the integration through that token.
	it.each(['gitlab', 'bitbucket'] as const)('sends an organization login to its own %s route', (provider) => {
		const account = { id: 'qTyaZThN7mnbef6iQ', username: 'balrog', organizationOwnerUserId: 'eCJxAGafqfxEVvmjx' };
		const expected = 'https://console.apify.com/organization/qTyaZThN7mnbef6iQ/settings/integrations';

		expect(getGitConnectUrl(provider, account)).toBe(expected);
		expect(getAddWorkspaceUrl(provider, account)).toBe(expected);
		expect(getGitStopUrl(provider, 'noWorkspace', account)).toBe(expected);
	});

	it.each(['gitlab', 'bitbucket'] as const)('leaves a personal %s login on the root route', (provider) => {
		const account = { id: 'eCJxAGafqfxEVvmjx', username: 'l2ysho' };

		expect(getGitConnectUrl(provider, account)).toBe('https://console.apify.com/settings/integrations');
		expect(getAddWorkspaceUrl(provider, account)).toBe('https://console.apify.com/settings/integrations');
	});

	it.each(['gitlab', 'bitbucket'] as const)('still points %s at Console in the next steps', (provider) => {
		const steps = buildGitSourceNextSteps({
			actorName: 'my-scraper',
			provider,
			stopReason: 'notAuthorized',
			remoteUrl: null,
			httpsUrl: null,
			repoName: 'my-scraper',
			scaffolded: false,
		});

		// A missing URL must not interpolate as the string "null".
		expect(steps.join('\n')).not.toContain('null');
		expect(steps).toContainEqual(expect.stringContaining('/settings/integrations'));
	});
});

describe('getGitConnectUrl', () => {
	afterEach(() => {
		delete process.env.APIFY_GITHUB_APP_CLIENT_ID;
		delete process.env.APIFY_CONSOLE_URL;
	});

	// Must stay byte-identical to what Console's authorizeGitHubApp() builds, since the callback page
	// that completes the exchange is Console's.
	it('points GitHub at the Console page that completes the exchange', () => {
		const url = new URL(getGitConnectUrl('github'));

		expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(url.searchParams.get('client_id')).toBe('Iv1.e39b3ed87e74885f');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://console.apify.com/actors/new/git/connected?service=github',
		);
	});

	// The callback page verifies the code as the account its route prefix selects, so an organization
	// login without this connects the personal account behind it and the CLI waits for nothing.
	it('sends an organization login to its own Console route', () => {
		const url = new URL(
			getGitConnectUrl('github', {
				id: 'qTyaZThN7mnbef6iQ',
				username: 'balrog',
				organizationOwnerUserId: 'eCJxAGafqfxEVvmjx',
			}),
		);
		const redirectUri = new URL(url.searchParams.get('redirect_uri')!);

		// Double-encoded, as Console builds it: the page decodes the value once before navigating there.
		expect(redirectUri.searchParams.get('routePrefix')).toBe('%2Forganization%2FqTyaZThN7mnbef6iQ');
		expect(decodeURIComponent(redirectUri.searchParams.get('routePrefix')!)).toBe('/organization/qTyaZThN7mnbef6iQ');
	});

	it('leaves a personal login on the root Console route', () => {
		const url = new URL(getGitConnectUrl('github', { id: 'eCJxAGafqfxEVvmjx', username: 'l2ysho' }));

		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://console.apify.com/actors/new/git/connected?service=github',
		);
	});

	it('honours the environment overrides', () => {
		process.env.APIFY_GITHUB_APP_CLIENT_ID = 'Iv1.staging';
		process.env.APIFY_CONSOLE_URL = 'https://console.staging.example.com';

		const url = new URL(getGitConnectUrl('github'));

		expect(url.searchParams.get('client_id')).toBe('Iv1.staging');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://console.staging.example.com/actors/new/git/connected?service=github',
		);
	});
});

describe('getAddWorkspaceUrl', () => {
	it('builds the app installation URL', () => {
		expect(getAddWorkspaceUrl('github')).toBe('https://github.com/apps/apify/installations/new');
	});
});

describe('readProviderState', () => {
	const integrations: GitProviderIntegration[] = [
		{ id: 'github-app', provider: 'github', workspaces: [{ id: 'apify', label: 'apify' }] },
		{
			id: 'integration-1',
			provider: 'gitlab',
			workspaces: [{ id: '4711', label: 'my-group' }],
			addWorkspaceUrl: 'https://gitlab.example.com/add',
		},
		{ id: 'integration-2', provider: 'gitlab', workspaces: [{ id: '99', label: 'other-group' }] },
	];

	// GitLab and Bitbucket report one integration per connected account; taking the first would
	// silently drop every other account.
	it('merges the workspaces of every connected account, each keeping its own account id', () => {
		expect(readProviderState(integrations, 'gitlab')).toEqual({
			connected: true,
			workspaces: [
				{ id: '4711', label: 'my-group', providerId: 'integration-1' },
				{ id: '99', label: 'other-group', providerId: 'integration-2' },
			],
			addWorkspaceUrl: 'https://gitlab.example.com/add',
		});
	});

	it('does not let one provider satisfy a lookup for another', () => {
		expect(readProviderState(integrations, 'bitbucket')).toEqual({
			connected: false,
			workspaces: [],
			addWorkspaceUrl: undefined,
		});
	});
});

describe('chooseWorkspace', () => {
	const apify: ResolvedWorkspace = { id: 'apify', label: 'apify', providerId: 'github-app' };
	const l2ysho: ResolvedWorkspace = { id: 'l2ysho', label: 'l2ysho', providerId: 'github-app' };
	const two = [apify, l2ysho];

	// GitLab addresses a namespace by numeric id, so the id and the label differ there.
	const gitlabGroup: ResolvedWorkspace = { id: '4711', label: 'my-group/sub', providerId: 'integration-1' };

	it('uses the only workspace when there is just one', async () => {
		expect(await chooseWorkspace([l2ysho], undefined, false)).toEqual({ workspace: l2ysho });
	});

	it('matches a requested workspace case-insensitively', async () => {
		expect(await chooseWorkspace(two, 'L2YSHO', false)).toEqual({ workspace: l2ysho });
	});

	// --git-repo 4711/my-scraper is not something anyone would type, so the label resolves too.
	it('matches a requested workspace by label when the id is opaque', async () => {
		expect(await chooseWorkspace([gitlabGroup], 'My-Group/Sub', false)).toEqual({ workspace: gitlabGroup });
	});

	it('rejects a workspace the user has not connected', async () => {
		expect(await chooseWorkspace(two, 'someone-else', false)).toEqual({ stopReason: 'unknownWorkspace' });
	});

	it('refuses to guess between several workspaces when it cannot ask', async () => {
		expect(await chooseWorkspace(two, undefined, false)).toEqual({ stopReason: 'ambiguousWorkspace' });
	});

	// Two connected GitLab accounts are two integrations; each workspace keeps the one that owns it.
	it('keeps the owning account on each workspace', async () => {
		const other: ResolvedWorkspace = { id: '99', label: 'other-group', providerId: 'integration-2' };
		const chosen = await chooseWorkspace([gitlabGroup, other], 'other-group', false);

		expect(chosen).toEqual({ workspace: other });
	});
});

describe('buildGitSourceNextSteps', () => {
	const base = {
		actorName: 'my-scraper',
		provider: 'github' as const,
		remoteUrl: 'git@github.com:acme-inc/my-scraper.git',
		httpsUrl: 'https://github.com/acme-inc/my-scraper.git',
		repoName: 'my-scraper',
		scaffolded: true,
	};

	// Every stop has to leave the user something actionable — recovery steps after the clone, a re-run
	// before it — so none of them is a dead end.
	it.each([
		'lookupFailed',
		'notAuthorized',
		'noWorkspace',
		'unknownWorkspace',
		'ambiguousWorkspace',
		'repoNameRejected',
		'repoCreateFailed',
		'gitSetupFailed',
		'actorCreateFailed',
		'deploymentKeyFailed',
	] as const)('leaves something actionable after %s', (stopReason) => {
		const steps = buildGitSourceNextSteps({ ...base, stopReason });

		expect(steps.length).toBeGreaterThan(0);
		expect(steps.every((step) => step.trim().length > 0)).toBe(true);
	});

	// Authorizing again cannot fix a missing installation, so these two must not send the user to the
	// same place.
	it('distinguishes "never connected" from "connected but no account"', () => {
		const notAuthorized = buildGitSourceNextSteps({ ...base, stopReason: 'notAuthorized' });
		const noWorkspace = buildGitSourceNextSteps({ ...base, stopReason: 'noWorkspace' });

		expect(notAuthorized).toContainEqual(expect.stringContaining('login/oauth/authorize'));
		expect(noWorkspace).toContainEqual(expect.stringContaining('installations/new'));
	});

	// The recovery URL has to carry the prefix too, or the re-run repeats the same dead end.
	it('keeps an organization login on its own route in the recovery steps', () => {
		const steps = buildGitSourceNextSteps({
			...base,
			stopReason: 'notAuthorized',
			account: { id: 'qTyaZThN7mnbef6iQ', username: 'balrog', organizationOwnerUserId: 'eCJxAGafqfxEVvmjx' },
		});

		expect(steps.join('\n')).toContain('routePrefix');
	});

	// A clone that landed already has its remote, so re-adding one would exit with "remote origin
	// already exists" — the only thing left undone is the local configuration.
	// The Actor is created before the clone is judged, so a missing deploy key can coexist with missing
	// files. Both have to be recoverable from one list.
	it('offers the clone alongside the deploy key when neither landed', () => {
		const steps = buildGitSourceNextSteps({
			...base,
			stopReason: 'deploymentKeyFailed',
			scaffolded: false,
			actorId: 'actor-1',
		});

		expect(steps[0]).toBe('git clone https://github.com/acme-inc/my-scraper.git "my-scraper"');
		expect(steps.at(-1)).toContain('deploy key');
	});

	it('does not rebuild the clone when only the local configuration failed', () => {
		const steps = buildGitSourceNextSteps({ ...base, stopReason: 'gitSetupFailed' });

		expect(steps).toContainEqual(`cd "${base.actorName}"`);
		expect(steps.join('\n')).not.toContain('git remote add');
		expect(steps.join('\n')).not.toContain('git clone');
	});

	// A failed clone leaves no local repository, so `git remote add` there would exit with "not a git
	// repository". The remote one exists, though, so cloning it again recovers the run.
	it('clones the repository when the clone itself failed', () => {
		const steps = buildGitSourceNextSteps({ ...base, stopReason: 'gitSetupFailed', scaffolded: false });

		expect(steps).toContainEqual(expect.stringContaining(`git clone ${base.httpsUrl}`));
		expect(steps).not.toContainEqual(expect.stringContaining('git remote add'));
	});

	// HTTPS needs a provider token, which many users have never made. An SSH key they already have gets
	// them the files without one.
	it('offers SSH as well as HTTPS when the clone has to be redone', () => {
		const steps = buildGitSourceNextSteps({ ...base, stopReason: 'gitSetupFailed', scaffolded: false });

		expect(steps).toContainEqual(expect.stringContaining(`git clone ${base.remoteUrl}`));
	});
});

describe('logGitSourceOutcome', () => {
	const result = (scaffolded: boolean): GitSourceResult => ({
		remoteUrl: null,
		httpsUrl: null,
		actorId: null,
		workspaces: null,
		stopReason: 'notAuthorized',
		error: 'Apify is not authorized to access your github account.',
		scaffolded,
	});

	// A stop before the clone is the only outcome the user gets — no success banner — so its wording
	// must not imply anything was created.
	it('says nothing was created when the stop came before the clone', () => {
		const lines: string[] = [];
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => lines.push(args.map(String).join(' ')));
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		try {
			logGitSourceOutcome(result(false), ['Re-run apify create']);
		} finally {
			errorSpy.mockRestore();
			logSpy.mockRestore();
		}

		expect(lines[0]).toContain('The Actor was not created');
		expect(lines[0]).not.toContain('scaffolded');
	});

	// A clone that could not authenticate no longer costs the Actor, so the wording must not claim it is
	// missing when it exists.
	it('says the Actor exists when only the clone failed', () => {
		const lines: string[] = [];
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => lines.push(args.map(String).join(' ')));
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		try {
			logGitSourceOutcome({ ...result(false), stopReason: 'gitSetupFailed', actorId: 'actor-1' }, [
				'git clone https://gitlab.com/me/my-scraper.git "my-scraper"',
			]);
		} finally {
			errorSpy.mockRestore();
			logSpy.mockRestore();
		}

		expect(lines[0]).toContain('Actor created');
		expect(lines[0]).not.toContain('was not created');
	});

	it('keeps the scaffold wording when the clone had already landed', () => {
		const lines: string[] = [];
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => lines.push(args.map(String).join(' ')));
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		try {
			logGitSourceOutcome(result(true), ['Re-run apify create']);
		} finally {
			errorSpy.mockRestore();
			logSpy.mockRestore();
		}

		expect(lines[0]).toContain('Actor scaffolded');
	});
});

describe('ensureUsableIntegration', () => {
	const client = { baseUrl: 'https://api.example.com/v2', token: 'token' } as never;

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** Answers `GET /integrations/git` with a different listing on each call; an `Error` fails that call. */
	const stubListings = (listings: (GitProviderIntegration[] | Error)[]) => {
		let call = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				const listing = listings[Math.min(call++, listings.length - 1)];
				if (listing instanceof Error) throw listing;

				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					text: async () => JSON.stringify({ data: listing }),
				};
			}),
		);
	};

	const gitlabIntegration: GitProviderIntegration = {
		id: 'integration-1',
		provider: 'gitlab',
		workspaces: [{ id: '4711', label: 'solar.richard' }],
	};

	it('takes the first listing when the provider is already usable', async () => {
		stubListings([[gitlabIntegration]]);

		const state = await ensureUsableIntegration('gitlab', { client, isInteractive: true });

		expect(state.workspaces).toEqual([{ id: '4711', label: 'solar.richard', providerId: 'integration-1' }]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	// Console's callback is not guaranteed: connecting on the page by hand never triggers it. The poll is
	// what makes that case work, so it must not depend on the hand-off resolving.
	it('picks up a connection made without a callback', async () => {
		stubListings([[], [gitlabIntegration]]);

		const state = await ensureUsableIntegration('gitlab', { client, isInteractive: true });

		expect(state.connected).toBe(true);
		expect(state.workspaces).toHaveLength(1);
	});

	// A dropped connection mid-wait used to reject out of the poll, which skipped the abort that closes the
	// loopback server — leaving the command hanging on its five-minute timer.
	it('keeps waiting when a listing lookup fails', async () => {
		stubListings([[], new Error('network down'), [gitlabIntegration]]);

		const state = await ensureUsableIntegration('gitlab', { client, isInteractive: true });

		expect(state.workspaces).toHaveLength(1);
	});

	// Console reports the connection as soon as the integration exists, which can beat its workspaces into
	// the listing. Stopping on that one empty read reported a connected account as a missing one.
	it('keeps waiting when the callback lands before the workspaces do', async () => {
		connectViaConsoleMock.mockResolvedValueOnce({ connected: true });
		stubListings([[], [{ ...gitlabIntegration, workspaces: [] }], [gitlabIntegration]]);

		const state = await ensureUsableIntegration('gitlab', { client, isInteractive: true });

		expect(state.workspaces).toEqual([{ id: '4711', label: 'solar.richard', providerId: 'integration-1' }]);
	});

	it('never waits on a browser it cannot open', async () => {
		stubListings([[]]);

		const state = await ensureUsableIntegration('gitlab', { client, isInteractive: false });

		expect(state).toEqual({ connected: false, workspaces: [], addWorkspaceUrl: undefined });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe('enableAutomaticBuilds', () => {
	const client = { baseUrl: 'https://api.example.com/v2', token: 'token' } as never;

	// The webhook is keyed to the single version `createGitActor` makes, so the path has to name it.
	it('toggles the webhook on the version the Actor was created with', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }) as never);

		try {
			await enableAutomaticBuilds({ client, providerId: 'integration-1', actorId: 'abc123' });

			const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://api.example.com/v2/actors/abc123/versions/0.0/build-on-push');
			expect(init.method).toBe('PUT');
			expect(JSON.parse(String(init.body))).toEqual({ providerId: 'integration-1', enabled: true });
		} finally {
			fetchMock.mockRestore();
		}
	});

	// Connecting an account does not grant admin rights on a repository, so this is the one platform step
	// a fully connected account can still be refused — and the API's own message says which.
	it('reports the API message when the provider refuses the webhook', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ error: { type: 'integration-auth', message: 'Repository admin required' } }), {
				status: 403,
			}) as never,
		);

		try {
			await expect(enableAutomaticBuilds({ client, providerId: 'integration-1', actorId: 'abc123' })).rejects.toThrow(
				'Repository admin required',
			);
		} finally {
			fetchMock.mockRestore();
		}
	});
});

describe('runGitSourceFlow', () => {
	const client = { baseUrl: 'https://api.example.com/v2', token: 'token' } as never;

	const options = {
		client,
		provider: 'github' as const,
		actorDir: '/tmp/apify-create-git-source',
		actorName: 'my-scraper',
		repoName: 'my-scraper',
		isPrivate: true,
		templateArchiveUrl: 'https://example.com/template.zip',
		isInteractive: true,
		autoBuild: true,
		customize: async () => {},
	};

	const jsonResponse = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

	// A taken name is fixable on the spot, so the run has to ask for another one rather than making the
	// user start over — the second attempt must reach the API with the name the user typed.
	it('asks for another repository name when the provider rejects the first one', async () => {
		useUserInputMock.mockResolvedValueOnce('my-scraper-2');

		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				jsonResponse(200, {
					data: [{ id: 'github-app', provider: 'github', workspaces: [{ id: 'apify', label: 'apify' }] }],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(400, { error: { type: 'invalid-parameter', message: 'Name already exists' } }),
			)
			.mockResolvedValueOnce(jsonResponse(500, { error: { type: 'internal-server-error', message: 'Boom' } }));

		try {
			const result = await runGitSourceFlow(options);

			expect(useUserInputMock).toHaveBeenCalledTimes(1);
			expect(JSON.parse(String(fetchMock.mock.calls[2][1]!.body))).toMatchObject({ repoName: 'my-scraper-2' });
			expect(result.stopReason).toBe('repoCreateFailed');
		} finally {
			fetchMock.mockRestore();
		}
	});

	// Nobody is there to answer the prompt, so a rejected name has to stop with actionable steps instead.
	it('stops on a rejected name when it cannot ask', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				jsonResponse(200, {
					data: [{ id: 'github-app', provider: 'github', workspaces: [{ id: 'apify', label: 'apify' }] }],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(400, { error: { type: 'invalid-parameter', message: 'Name already exists' } }),
			);

		try {
			const result = await runGitSourceFlow({ ...options, isInteractive: false });

			expect(useUserInputMock).not.toHaveBeenCalled();
			expect(result.stopReason).toBe('repoNameRejected');
		} finally {
			fetchMock.mockRestore();
		}
	});
});
