import { readFile, writeFile } from 'node:fs/promises';

import { useConsoleSpy } from '../../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../../__setup__/reset-cwd-caches.js';

const actorName = 'prints-error-message-on-node-project-with-no-detected-start';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { logMessages } = useConsoleSpy();

const { CreateCommand } = await import('../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../src/commands/run.js');

describe('apify run', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await CreateCommand.run([actorName, '--template', 'project_cheerio_crawler_js'], import.meta.url);
		toggleCwdBetweenFullAndParentPath();

		const pkgJsonPath = joinPath('package.json');
		const pkgJson = await readFile(pkgJsonPath, 'utf8');

		const pkgJsonObj = JSON.parse(pkgJson);

		delete pkgJsonObj.main;
		pkgJsonObj.scripts ??= {};
		delete pkgJsonObj.scripts.start;

		await writeFile(pkgJsonPath, JSON.stringify(pkgJsonObj, null, '\t'));

		resetCwdCaches();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should print error message on node project with no detected start', async () => {
		await expect(RunCommand.run([], import.meta.url)).resolves.toBeUndefined();

		expect(logMessages.error[0]).toMatch(/No entrypoint detected/i);
	});
});
