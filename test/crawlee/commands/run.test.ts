import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actorName = 'run-my-crawlee';
const pathToDefaultsInputSchema = fileURLToPath(
	new URL('../../__setup__/input-schemas/defaults.json', import.meta.url),
);

const overriddenMainJs = `
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

const { lastErrorMessage } = useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');

describe('apify run', () => {
	let inputPath: string;
	let outputPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await runCommand(CreateCommand, {
			args_actorName: actorName,
			flags_template: 'project_cheerio_crawler_js',
		});

		toggleCwdBetweenFullAndParentPath();

		await writeFile(joinPath('src', 'main.js'), overriddenMainJs);
		await writeFile(joinPath('.actor', 'input_schema.json'), await readFile(pathToDefaultsInputSchema, 'utf8'));

		inputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		outputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
	}, 120_000);

	afterAll(async () => {
		await afterAllCalls();
	});

	it('throws when required field is not provided', async () => {
		await writeFile(inputPath, '{}');

		await runCommand(RunCommand, {});

		expect(lastErrorMessage()).toMatch(/Field awesome is required/i);
	});

	it('prefills input with defaults', async () => {
		await writeFile(inputPath, originalInput);

		await runCommand(RunCommand, {});

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you' });
	});

	it('should restore the original input file after run', async () => {
		await writeFile(inputPath, originalInputWithExtraField);

		await runCommand(RunCommand, {});

		const input = JSON.parse(await readFile(inputPath, 'utf8'));
		expect(input).toStrictEqual({ awesome: true, extra: 'field' });

		const output = JSON.parse(await readFile(outputPath, 'utf8'));
		expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you', extra: 'field' });
	});
});
