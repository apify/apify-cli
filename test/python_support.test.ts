import { existsSync, writeFileSync } from 'node:fs';

import { loadJsonFileSync } from 'load-json-file';

import { useTempPath } from './__setup__/hooks/useTempPath.js';
import { detectPythonVersion, getLocalKeyValueStorePath } from '../src/lib/utils.js';

const actorName = 'my-python-actor';
const PYTHON_START_TEMPLATE_ID = 'python-start';
const {
    beforeAllCalls,
    afterAllCalls,
    joinPath,
    tmpPath,
    toggleCwdBetweenFullAndParentPath,
} = useTempPath(actorName, { create: true, remove: true, cwd: true, cwdParent: true });

const { CreateCommand } = await import('../src/commands/create.js');
const { RunCommand } = await import('../src/commands/run.js');

describe('Python support [python]', () => {
    beforeAll(async () => {
        await beforeAllCalls();
    });

    afterAll(async () => {
        await afterAllCalls();
    });

    it('Python templates work [python]', async () => {
        const pythonVersion = detectPythonVersion('.');
        // Don't fail this test when Python is not installed (it will be installed in the right CI workflow)
        if (!pythonVersion && !process.env.CI) {
            console.log('Skipping Python template test since Python is not installed');
            return;
        }

        await CreateCommand.run([actorName, '--template', PYTHON_START_TEMPLATE_ID], import.meta.url);

        // Check file structure
        expect(existsSync(tmpPath)).toBeTruthy();

        expect(existsSync(joinPath('.venv'))).toBeTruthy();
        expect(existsSync(joinPath('requirements.txt'))).toBeTruthy();

        const expectedOutput = {
            hello: 'world',
        };

        const actorCode = `from apify import Actor
async def main():
    async with Actor:
        await Actor.set_value('OUTPUT', ${JSON.stringify(expectedOutput)})
`;
        writeFileSync(joinPath('src', 'main.py'), actorCode, { flag: 'w' });

        toggleCwdBetweenFullAndParentPath();
        await RunCommand.run([], import.meta.url);

        // Check Actor output
        const actorOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actorOutput = loadJsonFileSync(actorOutputPath);
        expect(actorOutput).toStrictEqual(actorOutput);
    });
});
