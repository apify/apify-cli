import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { runCommand } from '../../../../../src/lib/command-framework/apify-command.js';
import { getLocalKeyValueStorePath } from '../../../../../src/lib/utils.js';
import { useTempPath } from '../../../../__setup__/hooks/useTempPath.js';

const actorName = 'works-with-invalid-main-but-start';

const mainFile = `
import { Actor } from 'apify';

await Actor.init();

await Actor.setValue('OUTPUT', 'worked');

await Actor.exit();
`;

const { beforeAllCalls, afterAllCalls, joinCwdPath, forceNewCwd } = useTempPath(actorName.replaceAll('-', ' '), {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { CreateCommand } = await import('../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../src/commands/run.js');

describe('apify run', () => {
	let outputPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await runCommand(CreateCommand, { flags_template: 'project_cheerio_crawler_js', args_actorName: actorName });

		forceNewCwd(actorName);

		const pkgJsonPath = joinCwdPath('package.json');
		const pkgJson = await readFile(pkgJsonPath, 'utf8');
		const pkgJsonObj = JSON.parse(pkgJson);

		pkgJsonObj.scripts ??= {};
		pkgJsonObj.scripts.start = 'node "./spaced test/main.js"';

		await writeFile(pkgJsonPath, JSON.stringify(pkgJsonObj, null, '\t'));

		await mkdir(joinCwdPath('spaced test'), { recursive: true });

		await writeFile(joinCwdPath('spaced test', 'main.js'), mainFile);

		outputPath = joinCwdPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should work with spaces in path to actor', async () => {
		await runCommand(RunCommand, {});

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toBe('worked');
	});
});
