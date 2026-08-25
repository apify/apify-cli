import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import type { GitSourceResult } from '../../../src/lib/git-source/gitSource.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// The Git flow gave up before the clone, so nothing reached the disk.
const AMBIGUOUS_WORKSPACE_STOP: GitSourceResult = {
	remoteUrl: null,
	httpsUrl: null,
	actorId: null,
	workspaces: ['apify', 'l2ysho'],
	stopReason: 'ambiguousWorkspace',
	error: 'Several accounts are connected (apify, l2ysho); pick one with --git-repo <account>/<name>.',
	scaffolded: false,
};

// The clone landed and the wiring after it did not, so the scaffold is on disk with no Actor behind it.
const GIT_SETUP_FAILED_STOP: GitSourceResult = {
	remoteUrl: 'git@github.com:apify/my-scraper.git',
	httpsUrl: 'https://github.com/apify/my-scraper.git',
	actorId: null,
	workspaces: ['apify'],
	stopReason: 'gitSetupFailed',
	error: 'Could not write the Actor configuration.',
	scaffolded: true,
};

// Which stop the mocked flow returns, set per suite below.
let stop: GitSourceResult = AMBIGUOUS_WORKSPACE_STOP;

// The platform half is what we stand in for; the local reporting around it is what is under test.
vitest.mock('../../../src/lib/git-source/gitSource.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/git-source/gitSource.js')>()),
	runGitSourceFlow: vitest.fn(async ({ actorDir }: { actorDir: string }) => {
		// Stand in for the clone: a scaffolded stop leaves a repository behind, which is what tells the
		// command it has no `git init` of its own to run.
		if (stop.scaffolded) await mkdir(join(actorDir, '.git'), { recursive: true });

		return stop;
	}),
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

describe('apify create --source github, stopped before the clone', () => {
	beforeEach(() => {
		stop = AMBIGUOUS_WORKSPACE_STOP;
	});

	it('fails, so a caller reading only the exit status is not told it worked', async () => {
		await run();

		expect(mockedProcess.exitCode).toBe(1);
	});

	it('reports the stop instead of a success banner for an empty directory', async () => {
		await run();

		const output = logMessages.error.join('\n');

		expect(output).not.toContain('created successfully');
		expect(output).toContain('The Actor was not created');
		expect(output).toContain('--git-repo');
	});

	// The stray repository this used to leave behind made the directory non-empty, which made the
	// re-run the next steps ask for fail with "directory already exists".
	it('leaves no git repository behind to block the re-run', async () => {
		await run();

		expect(existsSync(joinPath('.git'))).toBe(false);
	});
});

describe('apify create --source github, stopped after the clone', () => {
	beforeEach(() => {
		stop = GIT_SETUP_FAILED_STOP;
	});

	it('fails, so a caller reading only the exit status is not told it worked', async () => {
		await run();

		expect(mockedProcess.exitCode).toBe(1);
	});

	// The scaffold is on disk, but the Actor is not wired up — so the banner's "created successfully" and
	// its generic next steps would both contradict the recovery steps the stop carries.
	it('reports the stop once, in place of the success banner', async () => {
		await run();

		const output = logMessages.error.join('\n');

		expect(output).not.toContain('created successfully');
		expect(output).toContain('Actor scaffolded, but the Git setup did not finish');
		expect(output.match(/Next steps:/g)).toHaveLength(1);
		expect(output).toContain(`cd "${actName}"`);
	});
});
