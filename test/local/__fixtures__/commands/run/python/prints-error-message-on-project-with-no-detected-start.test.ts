import { rename } from 'node:fs/promises';

import { runCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../../../__setup__/reset-cwd-caches.js';

const actorName = 'prints-error-message-on-python-project-with-no-detected-start';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { lastErrorMessage } = useConsoleSpy();

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[python] prints error message on project with no detected start', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await runCommand(CreateCommand, { flags_template: 'python-start', args_actorName: actorName });
		toggleCwdBetweenFullAndParentPath();

		const srcFolder = joinPath('src');
		await rename(srcFolder, joinPath('entrypoint'));

		resetCwdCaches();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should print error message', async () => {
		await runCommand(RunCommand, {});

		expect(lastErrorMessage()).toMatch(/Actor is of an unknown format./i);
	});
});
