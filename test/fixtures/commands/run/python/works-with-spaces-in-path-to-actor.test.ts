import { readFile, writeFile } from 'node:fs/promises';

import { getLocalKeyValueStorePath } from '../../../../../src/lib/utils.js';
import { useTempPath } from '../../../../__setup__/hooks/useTempPath.js';

const actorName = 'works-with-spaces-in-path-to-actor-python';

const mainFile = `
from apify import Actor

async def main():
	async with Actor:
		await Actor.set_value('OUTPUT', 'worked')
`;

const { beforeAllCalls, afterAllCalls, joinCwdPath, forceNewCwd } = useTempPath(actorName.replaceAll('-', ' '), {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { CreateCommand } = await import('../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../src/commands/run.js');

describe('[python] apify run', () => {
	let outputPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		await CreateCommand.run([actorName, '--template', 'python-start'], import.meta.url);

		forceNewCwd(actorName);

		await writeFile(joinCwdPath('src', 'main.py'), mainFile);

		outputPath = joinCwdPath(getLocalKeyValueStorePath(), 'OUTPUT.txt');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should work with spaces in path to actor', async () => {
		await RunCommand.run([], import.meta.url);

		const output = await readFile(outputPath, 'utf8');
		expect(output).toBe('worked');
	});
});
