import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import type { GitSourceResult } from '../../../src/lib/git-source/gitSource.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// Repository created, cloned, Actor created, deploy key registered.
const SUCCESS: GitSourceResult = {
	remoteUrl: 'git@github.com:apify/my-scraper.git',
	httpsUrl: 'https://github.com/apify/my-scraper.git',
	actorId: 'aBcD1234efGh',
	workspaces: ['apify'],
	stopReason: null,
	error: null,
	scaffolded: true,
	automaticBuilds: 'on',
};

// Gave up before the clone, so nothing reached the disk.
const AMBIGUOUS_WORKSPACE_STOP: GitSourceResult = {
	remoteUrl: null,
	httpsUrl: null,
	actorId: null,
	workspaces: ['apify', 'l2ysho'],
	stopReason: 'ambiguousWorkspace',
	error: 'Several accounts are connected (apify, l2ysho); pick one with --git-repo <account>/<name>.',
	scaffolded: false,
	automaticBuilds: 'off',
};

// The clone landed but the wiring after it did not, so the scaffold is on disk with no Actor.
const GIT_SETUP_FAILED_STOP: GitSourceResult = {
	remoteUrl: 'git@github.com:apify/my-scraper.git',
	httpsUrl: 'https://github.com/apify/my-scraper.git',
	actorId: null,
	workspaces: ['apify'],
	stopReason: 'gitSetupFailed',
	error: 'Could not write the Actor configuration.',
	scaffolded: true,
	automaticBuilds: 'off',
};

let stop: GitSourceResult = AMBIGUOUS_WORKSPACE_STOP;

// Stands in for the platform half; the local reporting around it is what is under test.
vitest.mock('../../../src/lib/git-source/gitSource.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/git-source/gitSource.js')>()),
	runGitSourceFlow: vitest.fn(
		async ({
			actorDir,
			customize,
		}: {
			actorDir: string;
			autoBuild: boolean;
			customize: (dir: string) => Promise<void>;
		}) => {
			// Stand in for the clone: a scaffolded stop leaves a repository behind.
			if (stop.scaffolded) {
				await mkdir(join(actorDir, '.git'), { recursive: true });
				await customize(actorDir);
			}

			return stop;
		},
	),
}));

// A Git source needs a token; the mocked flow never uses the client, so an empty one is enough.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getLoggedClientOrThrow: vitest.fn(async () => ({})),
}));

const actName = 'create-git-source-actor';
const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { logMessages } = useConsoleSpy();

// `useTempPath({ cwd: true })` mocks `node:process` with a spread copy to fake `cwd()`, so the command
// writes `exitCode` on that copy rather than on the real process. Import it the same way the command
// does — after the mock is installed — to read what it actually set.
const { default: mockedProcess } = await import('node:process');

const { CreateCommand } = await import('../../../src/commands/create.js');

const run = () =>
	testRunCommand(CreateCommand, {
		args_actorName: actName,
		flags_template: 'project_empty',
		flags_source: 'github',
		flags_skipDependencyInstall: true,
	});

// Put the exit code back, so a failing run cannot leak into the tests that follow.
let originalExitCode: typeof mockedProcess.exitCode;

beforeEach(async () => {
	originalExitCode = mockedProcess.exitCode;
	await beforeAllCalls();
});

afterEach(async () => {
	mockedProcess.exitCode = originalExitCode;
	await afterAllCalls();
});

// A flag the run would ignore is worse than a stop, which is how `--git-repo` and `--skip-git-init`
// already behave against the wrong source.
describe('apify create --auto-build without a Git source', () => {
	it('stops instead of ignoring the flag', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_source: 'apify',
			flags_skipDependencyInstall: true,
			flags_autoBuild: 'off',
		});

		expect(logMessages.error.join('\n')).toContain('--auto-build only applies to a Git source');
	});
});

describe('apify create --source github, stopped before the clone', () => {
	beforeEach(() => {
		stop = AMBIGUOUS_WORKSPACE_STOP;
	});

	it('exits non-zero', async () => {
		await run();

		expect(mockedProcess.exitCode).toBe(1);
	});

	it('reports the stop instead of a success banner', async () => {
		await run();

		const output = logMessages.error.join('\n');

		expect(output).not.toContain('created successfully');
		expect(output).toContain('The Actor was not created');
		expect(output).toContain('--git-repo');
	});

	// A stray repository would make the directory non-empty, so the re-run the next steps ask for would
	// fail with "directory already exists".
	it('leaves no git repository behind', async () => {
		await run();

		expect(existsSync(joinPath('.git'))).toBe(false);
	});
});

describe('apify create --source github, stopped after the clone', () => {
	beforeEach(() => {
		stop = GIT_SETUP_FAILED_STOP;
	});

	it('exits non-zero', async () => {
		await run();

		expect(mockedProcess.exitCode).toBe(1);
	});

	it('reports the stop once, in place of the success banner', async () => {
		await run();

		const output = logMessages.error.join('\n');

		expect(output).not.toContain('created successfully');
		expect(output).toContain('Actor scaffolded, but the Git setup did not finish');
		expect(output.match(/Next steps:/g)).toHaveLength(1);
		expect(output).toContain(`cd "${actName}"`);
	});
});

describe('apify create --source github, successful', () => {
	beforeEach(() => {
		stop = SUCCESS;
	});

	it('exits zero', async () => {
		await run();

		expect(mockedProcess.exitCode).toBeFalsy();
	});

	it('points at the repository instead of "apify push"', async () => {
		await run();

		// The banner is UI, so it goes to stderr — stdout stays clear for the `--json` payload.
		const output = logMessages.error.join('\n');

		expect(output).toContain('created successfully');
		expect(output).toContain(SUCCESS.remoteUrl);
		expect(output).toContain(SUCCESS.actorId);
		expect(output).toContain('Every push to this repository rebuilds the Actor');
		// A Git-sourced Actor builds from the repository, so the push tip would be wrong.
		expect(output).not.toContain('apify push');
	});

	// Automatic builds are on unless asked otherwise, and someone who turned them off does not need to be
	// told how to turn them on.
	it('honours --auto-build=off', async () => {
		stop = { ...SUCCESS, automaticBuilds: 'off' };

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_source: 'github',
			flags_skipDependencyInstall: true,
			flags_autoBuild: 'off',
		});

		const { runGitSourceFlow } = await import('../../../src/lib/git-source/gitSource.js');
		expect(vitest.mocked(runGitSourceFlow).mock.lastCall![0]).toMatchObject({ autoBuild: false });

		const output = logMessages.error.join('\n');
		expect(output).toContain('created successfully');
		expect(output).not.toContain('Automatic builds');
		expect(output).not.toContain('Every push');
	});

	it('applies the local configuration to the clone', async () => {
		await run();

		const localConfig = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));

		expect(localConfig.name).toBe(actName);
	});

	it('reports the remote and the Actor in --json', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_source: 'github',
			flags_skipDependencyInstall: true,
			flags_json: true,
		});

		expect(logMessages.log).toHaveLength(1);

		const output = JSON.parse(logMessages.log[0]);

		expect(output.source).toBe('github');
		expect(output.automaticBuilds).toBe('on');
		expect(output.stopReason).toBeNull();
		expect(output.error).toBeNull();
		expect(output.remote).toBe(SUCCESS.remoteUrl);
		expect(output.actorId).toBe(SUCCESS.actorId);
		// The clone made it a repository, so the CLI runs no `git init` of its own — the field still has
		// to say there is one, or an agent runs `git init` inside a clone.
		expect(output.gitRepositoryInitialized).toBe(true);
	});
});
