import { existsSync } from 'node:fs';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import type { GitSourceResult } from '../../../src/lib/git-source/gitSource.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// The stop this file exercises: the Git flow gave up before the clone, so nothing reached the disk.
const AMBIGUOUS_WORKSPACE_STOP: GitSourceResult = {
	remoteUrl: null,
	actorId: null,
	workspaces: ['apify', 'l2ysho'],
	stopReason: 'ambiguousWorkspace',
	error: 'Several accounts are connected (apify, l2ysho); pick one with --git-repo <account>/<name>.',
	scaffolded: false,
};

// The platform half is what we stand in for; the local reporting around it is what is under test.
vitest.mock('../../../src/lib/git-source/gitSource.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/git-source/gitSource.js')>()),
	runGitSourceFlow: vitest.fn(async () => AMBIGUOUS_WORKSPACE_STOP),
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

describe('apify create --source github, stopped before the clone', () => {
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
