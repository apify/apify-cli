import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	buildGitSourceNextSteps,
	getAddWorkspaceUrl,
	getGitConnectUrl,
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

	// Authorizing again cannot fix a missing installation, so these two must not send the user to the
	// same place.
	it('distinguishes "never connected" from "connected but no account"', () => {
		const notAuthorized = buildGitSourceNextSteps({ ...base, stopReason: 'notAuthorized' });
		const noWorkspace = buildGitSourceNextSteps({ ...base, stopReason: 'noWorkspace' });

		expect(notAuthorized).toContainEqual(expect.stringContaining('login/oauth/authorize'));
		expect(noWorkspace).toContainEqual(expect.stringContaining('installations/new'));
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
