import { rm } from 'node:fs/promises';

import { testRunCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../../../__setup__/reset-cwd-caches.js';

const actorName = 'prints-error-message-on-python-project-with-no-detected-start';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[python] prints error message on project with no detected start', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, { flags_template: 'python-start', args_actorName: actorName });
		toggleCwdBetweenFullAndParentPath();

		// Remove src/ package and requirements.txt so there is no detectable Python package structure
		const srcFolder = joinPath('src');
		await rm(srcFolder, { recursive: true, force: true });

		const requirementsTxt = joinPath('requirements.txt');
		await rm(requirementsTxt, { force: true });

		resetCwdCaches();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should print error message', async () => {
		await expect(testRunCommand(RunCommand, {})).rejects.toThrow(/Actor is of an unknown format./i);
	});
});
