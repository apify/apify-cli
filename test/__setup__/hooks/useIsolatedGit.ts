import { mkdirSync, writeFileSync } from 'node:fs';

import { useTempPath } from './useTempPath.js';

/**
 * Gives git an empty home, XDG config directory and global config for the tests of a file, so the developer's own
 * settings and global excludes file don't apply. `name` names the temp directory that holds them, so it must be unique
 * per test file.
 */
export function useIsolatedGit(name: string) {
	const gitHome = useTempPath(name, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	/** Points git, and `os.homedir()`, at another home or XDG config directory. Left out, each is the empty one. */
	const stubGitHome = (home = gitHome.joinPath('home'), xdgConfigHome = gitHome.joinPath('xdg')) => {
		// os.homedir() reads USERPROFILE on Windows and HOME elsewhere. Git reads HOME everywhere.
		vitest.stubEnv('HOME', home);
		vitest.stubEnv('USERPROFILE', home);
		vitest.stubEnv('XDG_CONFIG_HOME', xdgConfigHome);
		vitest.stubEnv('GIT_CONFIG_GLOBAL', gitHome.joinPath('gitconfig'));
		vitest.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
	};

	beforeAll(async () => {
		await gitHome.beforeAllCalls();

		mkdirSync(gitHome.joinPath('home'), { recursive: true });
		mkdirSync(gitHome.joinPath('xdg'), { recursive: true });
		writeFileSync(gitHome.joinPath('gitconfig'), '');
		stubGitHome();
	});

	afterAll(async () => {
		vitest.unstubAllEnvs();
		await gitHome.afterAllCalls();
	});

	return { stubGitHome };
}
