import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { usePythonRuntime } from '../../../src/lib/hooks/runtimes/python.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actorName = 'my-python-actor';
const PYTHON_START_TEMPLATE_ID = 'python-start';
const { beforeAllCalls, afterAllCalls, joinPath, tmpPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: false,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');

describe('[python] Python support', () => {
	beforeAll(async () => {
		await beforeAllCalls();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
	});

	it('should work', { timeout: TEST_TIMEOUT }, async () => {
		const runtime = await usePythonRuntime({ cwd: tmpPath, force: true });

		const pythonVersion = runtime.map((r) => r.version).unwrapOr(undefined);

		// Don't fail this test when Python is not installed (it will be installed in the right CI workflow)
		if (!pythonVersion && !process.env.CI) {
			console.log('Skipping Python template test since Python is not installed');
			return;
		}

		if (existsSync(tmpPath)) {
			// Remove the tmp path if it exists
			await rm(tmpPath, { recursive: true, force: true });
		}

		await testRunCommand(CreateCommand, {
			args_actorName: actorName,
			flags_template: PYTHON_START_TEMPLATE_ID,
		});

		// Check file structure
		expect(existsSync(tmpPath)).toBeTruthy();

		expect(existsSync(joinPath('.venv'))).toBeTruthy();
		expect(existsSync(joinPath('requirements.txt'))).toBeTruthy();

		const expectedOutput = {
			hello: 'world',
		};

		const actorCode = /* py */ `from apify import Actor
async def main():
    async with Actor:
        await Actor.set_value('OUTPUT', ${JSON.stringify(expectedOutput)})
`;

		writeFileSync(joinPath('src', 'main.py'), actorCode, { flag: 'w' });

		toggleCwdBetweenFullAndParentPath();

		await testRunCommand(RunCommand, {});

		// Check Actor output
		const actorOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT');
		const actorOutput = JSON.parse(readFileSync(actorOutputPath, 'utf8'));
		expect(actorOutput).toStrictEqual(expectedOutput);
	});
});
