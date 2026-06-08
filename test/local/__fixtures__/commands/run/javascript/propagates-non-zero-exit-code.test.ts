import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { testRunCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';

const actorName = 'propagates-non-zero-exit-code';

const failingActorMainPath = fileURLToPath(new URL('./sources/failing-main.js', import.meta.url));

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[javascript] propagates the non-zero exit code when the Actor fails', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			flags_template: 'project_empty',
			args_actorName: actorName,
		});
		toggleCwdBetweenFullAndParentPath();

		await copyFile(failingActorMainPath, joinPath('src', 'main.js'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should set process.exitCode to the Actor exit code', async () => {
		// The cwd mock (useTempPath with cwd: true) replaces the `node:process` module, so the
		// command writes process.exitCode to that mocked copy. Read it back from the same instance.
		const { default: cliProcess } = await import('node:process');
		cliProcess.exitCode = 0;

		await testRunCommand(RunCommand, { flags_purge: true });

		// Matches the `process.exit(10)` in sources/failing-main.js
		expect(cliProcess.exitCode).toBe(10);
	});
});
