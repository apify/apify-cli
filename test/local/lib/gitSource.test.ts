import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	buildGitSourceNextSteps,
	getAddWorkspaceUrl,
	getGitConnectUrl,
	createGrantTracker,
	getPendingGrants,
	type GitProviderIntegration,
	type GitSourceResult,
	isGitProvider,
	logGitSourceOutcome,
	parseGitRepoFlag,
	runGitSourceFlow,
	chooseWorkspace,
} from '../../../src/lib/git-source/gitSource.js';
import { useUserInput } from '../../../src/lib/hooks/user-confirmations/useUserInput.js';

vi.mock('../../../src/lib/hooks/user-confirmations/useUserInput.js', () => ({
	useUserInput: vi.fn(),
}));

const useUserInputMock = vi.mocked(useUserInput);

beforeEach(() => {
	useUserInputMock.mockReset();
});

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

	it.each(['acme-inc/', '/my-scraper', 'a/b/c'])('rejects %s', (value) => {
		expect(() => parseGitRepoFlag(value, 'my-scraper')).toThrow(/Use "workspace\/name" or just "name"/);
	});
});

describe('isGitProvider', () => {
	it('separates the Git-backed sources from the default one', () => {
		expect(isGitProvider('github')).toBe(true);
		expect(isGitProvider('apify')).toBe(false);
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

describe('getPendingGrants', () => {
	const account = { id: 'orgId', username: 'my-org', organizationOwnerUserId: 'ownerId' };
	const authorize = 'https://github.com/login/oauth/authorize';
	const install = 'https://github.com/apps/apify/installations/new';
	const empty: GitProviderIntegration = { id: 'github-app', provider: 'github', workspaces: [] };

	// The API leaves the integration out entirely until the user has authorized, so this state is the
	// only unambiguous one.
	it('asks only for authorization when nothing is connected', () => {
		const grants = getPendingGrants('github', undefined, { account });

		expect(grants).toHaveLength(1);
		expect(grants[0].kind).toBe('connect');
		expect(grants[0].url).toContain(authorize);
		expect(grants[0].url).toContain('routePrefix');
	});

	// An authorized user who has installed the app nowhere and one whose token the provider revoked are
	// reported identically, and the fix for one does nothing for the other, so neither may be dropped.
	it('names both grants when the integration has no workspaces', () => {
		const grants = getPendingGrants('github', empty, { account });

		expect(grants.map(({ kind }) => kind)).toEqual(['connect', 'install']);
		expect(grants[0].url).toContain(authorize);
		expect(grants[1].url).toBe(install);
	});

	// The run watched the user authorize, so the integration it is seeing now is that grant landing, which
	// settles authorization and leaves only the installation.
	it('asks only for the installation once this run has sent the user through authorization', () => {
		const grants = getPendingGrants('github', empty, { account, authorizedHere: true });

		expect(grants.map(({ kind }) => kind)).toEqual(['install']);
		expect(grants[0].url).toBe(install);
	});

	// `addWorkspaceUrl` is derived from a live installation listing, so the token behind it works and the
	// ambiguity does not apply.
	it('asks only for the installation when the API reports a place to add one', () => {
		const grants = getPendingGrants('github', { ...empty, addWorkspaceUrl: install }, { account });

		expect(grants.map(({ kind }) => kind)).toEqual(['install']);
	});

	it('prefers the installation URL the API reports over the one it builds', () => {
		const reported = 'https://github.com/apps/apify-staging/installations/new';
		const grants = getPendingGrants('github', { ...empty, addWorkspaceUrl: reported }, { account });

		expect(grants.find(({ kind }) => kind === 'install')?.url).toBe(reported);
	});

	// The wait line is the only thing on screen while the CLI polls, so it has to name the grant that is
	// actually pending.
	it('carries a wait line matching each grant', () => {
		const [connect, installGrant] = getPendingGrants('github', empty, { account });

		expect(connect.waiting).toContain('authorization');
		expect(installGrant.waiting).toContain('installation');
	});
});

describe('createGrantTracker', () => {
	const account = { id: 'orgId', username: 'my-org', organizationOwnerUserId: 'ownerId' };
	const empty: GitProviderIntegration = { id: 'github-app', provider: 'github', workspaces: [] };
	const filled: GitProviderIntegration = {
		id: 'github-app',
		provider: 'github',
		workspaces: [],
		addWorkspaceUrl: 'https://github.com/apps/apify/installations/new',
	};

	it('offers both grants once when the state is ambiguous, then goes quiet', () => {
		const track = createGrantTracker('github', account);

		expect(track(empty)?.map(({ kind }) => kind)).toEqual(['connect', 'install']);
		expect(track(empty)).toBeNull();
		expect(track(empty)).toBeNull();
	});

	// Offering authorization in the ambiguous state says nothing about whether the user completed it.
	// Counting it as done reordered the grants on the next poll and opened a second tab two seconds
	// after sending the user to the first one.
	it('does not treat an authorization offered in the ambiguous state as completed', () => {
		const track = createGrantTracker('github', account);
		const first = track(empty);

		expect(first?.[0].kind).toBe('connect');
		expect(track(empty)).toBeNull();
	});

	it('moves on to the installation once authorization it watched has landed', () => {
		const track = createGrantTracker('github', account);

		expect(track(undefined)?.map(({ kind }) => kind)).toEqual(['connect']);
		expect(track(empty)?.map(({ kind }) => kind)).toEqual(['install']);
		expect(track(empty)).toBeNull();
	});

	it('never offers the same URL twice in a row', () => {
		const track = createGrantTracker('github', account);
		const opened: string[] = [];

		for (const state of [undefined, empty, empty, filled, filled]) {
			const grants = track(state);
			if (grants) opened.push(grants[0].url);
		}

		expect(new Set(opened).size).toBe(opened.length);
	});
});

describe('chooseWorkspace', () => {
	const two: GitProviderIntegration = {
		id: 'github-app',
		provider: 'github',
		workspaces: [
			{ id: 'apify', label: 'apify' },
			{ id: 'l2ysho', label: 'l2ysho' },
		],
	};
	const one: GitProviderIntegration = { ...two, workspaces: [{ id: 'l2ysho', label: 'l2ysho' }] };

	it('uses the only workspace when there is just one', async () => {
		expect(await chooseWorkspace(one, undefined, false)).toEqual({ workspace: 'l2ysho' });
	});

	it('matches a requested workspace case-insensitively', async () => {
		expect(await chooseWorkspace(two, 'L2YSHO', false)).toEqual({ workspace: 'l2ysho' });
	});

	it('rejects a workspace the user has not connected', async () => {
		expect(await chooseWorkspace(two, 'someone-else', false)).toEqual({ stopReason: 'unknownWorkspace' });
	});

	it('refuses to guess between several workspaces when it cannot ask', async () => {
		expect(await chooseWorkspace(two, undefined, false)).toEqual({ stopReason: 'ambiguousWorkspace' });
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

	// `noWorkspace` names both grants, because at that point the two are indistinguishable — but the
	// installation is the one the `notAuthorized` steps never mention.
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
});

describe('logGitSourceOutcome', () => {
	const result = (scaffolded: boolean): GitSourceResult => ({
		remoteUrl: null,
		httpsUrl: null,
		actorId: null,
		workspaces: null,
		stopReason: 'notAuthorized',
		error: 'Apify is not authorized to access github.',
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
