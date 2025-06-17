import { readFile, writeFile } from 'node:fs/promises';

import { runCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { getLocalKeyValueStorePath } from '../../../../../../src/lib/utils.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';

const actorName = 'works-with-invalid-main-but-start';

const mainFile = `
import { Actor } from 'apify';

await Actor.init();

await Actor.setValue('OUTPUT', 'worked');

await Actor.exit();
`;

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[javascript] works with invalid main but start script', () => {
	let outputPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await runCommand(CreateCommand, { flags_template: 'project_cheerio_crawler_js', args_actorName: actorName });
		toggleCwdBetweenFullAndParentPath();

		await writeFile(joinPath('src', 'index.js'), mainFile);

		const pkgJsonPath = joinPath('package.json');
		const pkgJson = await readFile(pkgJsonPath, 'utf8');
		const pkgJsonObj = JSON.parse(pkgJson);

		// Force a wrong main file
		pkgJsonObj.main = 'src/main.ts';
		pkgJsonObj.scripts ??= {};

		// but a valid start script
		pkgJsonObj.scripts.start = 'node src/index.js';

		await writeFile(pkgJsonPath, JSON.stringify(pkgJsonObj, null, '\t'));

		outputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should work', async () => {
		await runCommand(RunCommand, {});

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toBe('worked');
	});
});
