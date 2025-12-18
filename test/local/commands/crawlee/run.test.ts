import { readFile, writeFile } from 'node:fs/promises';

import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { getLocalKeyValueStorePath } from '../../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../../__setup__/consts.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import { defaultsInputSchemaPath } from '../../../__setup__/input-schemas/paths.js';

const actorName = 'run-my-crawlee';

const overriddenMainJs = /* js */ `
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput();
await Actor.setValue('OUTPUT', input);

await Actor.exit();
`;

const originalInput = JSON.stringify({ awesome: true });
const originalInputWithExtraField = JSON.stringify({ awesome: true, extra: 'field' });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../src/commands/run.js');

describe('apify run', () => {
	let inputPath: string;
	let outputPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			args_actorName: actorName,
			flags_template: 'project_cheerio_crawler_js',
		});

		toggleCwdBetweenFullAndParentPath();

		await writeFile(joinPath('src', 'main.js'), overriddenMainJs);
		await writeFile(joinPath('.actor', 'input_schema.json'), await readFile(defaultsInputSchemaPath, 'utf8'));

		inputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		outputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await afterAllCalls();
	});

	it('throws when required field is not provided', async () => {
		await writeFile(inputPath, '{}');

		await expect(testRunCommand(RunCommand, {})).rejects.toThrow(/Field awesome is required/i);
	});

	it('prefills input with defaults', async () => {
		await writeFile(inputPath, originalInput);

		await testRunCommand(RunCommand, {});

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you' });
	});

	it('should restore the original input file after run', async () => {
		await writeFile(inputPath, originalInputWithExtraField);

		await testRunCommand(RunCommand, {});

		const input = JSON.parse(await readFile(inputPath, 'utf8'));
		expect(input).toStrictEqual({ awesome: true, extra: 'field' });

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you', extra: 'field' });
	});
});
