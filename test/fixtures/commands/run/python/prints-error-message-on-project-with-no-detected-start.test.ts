import { rename } from 'node:fs/promises';

import { useTempPath } from '../../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../../__setup__/reset-cwd-caches.js';

const actorName = 'prints-error-message-on-python-project-with-no-detected-start';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../src/commands/run.js');

describe('[python] apify run', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await CreateCommand.run([actorName, '--template', 'python-start'], import.meta.url);
		toggleCwdBetweenFullAndParentPath();

		const srcFolder = joinPath('src');
		await rename(srcFolder, joinPath('entrypoint'));

		resetCwdCaches();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should print error message on python project with no detected start', async () => {
		await expect(RunCommand.run([], import.meta.url)).rejects.toThrow(/Actor is of an unknown format./i);
	});
});
