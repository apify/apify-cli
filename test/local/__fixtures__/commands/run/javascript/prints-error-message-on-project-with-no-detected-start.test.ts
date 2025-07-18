import { readFile, writeFile } from 'node:fs/promises';

import { testRunCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../../../__setup__/reset-cwd-caches.js';

const actorName = 'prints-error-message-on-node-project-with-no-detected-start';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { logMessages } = useConsoleSpy();

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[javascript] prints error message on project with no detected start', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			flags_template: 'project_cheerio_crawler_js',
			args_actorName: actorName,
		});
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

	it('should print error message', async () => {
		await testRunCommand(RunCommand, {});

		expect(logMessages.error[0]).toMatch(/No entrypoint detected/i);
	});
});
