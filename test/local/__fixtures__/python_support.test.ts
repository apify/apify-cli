import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { usePythonRuntime } from '../../../src/lib/hooks/runtimes/python.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actorName = 'my-python-actor';
const PYTHON_START_TEMPLATE_ID = 'python-start';
const { beforeAllCalls, afterAllCalls, joinPath, tmpPath, resetCwd, toggleCwdBetweenFullAndParentPath } = useTempPath(
	actorName,
	{
		create: true,
		remove: true,
		cwd: true,
		cwdParent: true,
	},
);

const { logMessages } = useConsoleSpy();

// Both commands below report a failed child process through the CLI's own output and then keep going,
// so without this every failure here surfaces as a missing file several steps later.
const cliOutput = () => [...logMessages.error, ...logMessages.log].join('\n') || '(the CLI printed nothing)';

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
		// A retry re-runs the test body but not the hooks, so the cwd toggled below would leak into the
		// next attempt and make "apify create" scaffold one directory too deep.
		resetCwd();
		resetCwdCaches();
	});

	it('should work', { timeout: TEST_TIMEOUT }, async () => {
		if (existsSync(tmpPath)) {
			// Remove the tmp path before detecting the runtime, so a leftover .venv is not picked up
			await rm(tmpPath, { recursive: true, force: true });
		}

		const runtime = await usePythonRuntime({ cwd: tmpPath, force: true });

		const pythonVersion = runtime.map((r) => r.version).unwrapOr(undefined);

		// Don't fail this test when Python is not installed (it will be installed in the right CI workflow)
		if (!pythonVersion && !process.env.CI) {
			console.log('Skipping Python template test since Python is not installed');
			return;
		}

		await testRunCommand(CreateCommand, {
			args_actorName: actorName,
			flags_template: PYTHON_START_TEMPLATE_ID,
		});

		// Check file structure
		expect(existsSync(tmpPath)).toBeTruthy();

		expect(
			existsSync(joinPath('.venv')),
			`No virtual environment was created. CLI output:\n${cliOutput()}`,
		).toBeTruthy();
		expect(existsSync(joinPath('requirements.txt'))).toBeTruthy();

		const expectedOutput = {
			hello: 'world',
		};

		const actorCode = /* py */ `from apify import Actor
async def main():
    async with Actor:
        await Actor.set_value('OUTPUT', ${JSON.stringify(expectedOutput)})
`;

		writeFileSync(joinPath('my_actor', 'main.py'), actorCode, {
			flag: 'w',
		});

		toggleCwdBetweenFullAndParentPath();

		await testRunCommand(RunCommand, {});

		// Check Actor output
		const actorOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT');

		expect(existsSync(actorOutputPath), `The Actor run wrote no OUTPUT. CLI output:\n${cliOutput()}`).toBeTruthy();

		const actorOutput = JSON.parse(readFileSync(actorOutputPath, 'utf8'));
		expect(actorOutput).toStrictEqual(expectedOutput);
	});
});
