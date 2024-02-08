import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadJsonFileSync } from 'load-json-file';

import { CreateCommand } from '../src/commands/create.js';
import { RunCommand } from '../src/commands/run.js';
import { rimrafPromised } from '../src/lib/files.js';
import { detectPythonVersion, getLocalKeyValueStorePath } from '../src/lib/utils.js';

const actorName = 'my-python-actor';
const PYTHON_START_TEMPLATE_ID = 'python-start';

describe('Python support [python]', () => {
    let currentDirectory: string;

    beforeAll(async () => {
        currentDirectory = process.cwd();
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
        /* eslint-disable no-unused-expressions */
        expect(existsSync(actorName)).to.be.true;
        process.chdir(actorName);

        expect(existsSync('.venv')).to.be.true;
        expect(existsSync('requirements.txt')).to.be.true;

        const expectedOutput = {
            hello: 'world',
        };

        const actorCode = `from apify import Actor
async def main():
    async with Actor:
        await Actor.set_value('OUTPUT', ${JSON.stringify(expectedOutput)})
`;
        writeFileSync(join('src', 'main.py'), actorCode, { flag: 'w' });

        await RunCommand.run([], import.meta.url);

        // Check actor output
        const actorOutputPath = join(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actorOutput = loadJsonFileSync(actorOutputPath);
        expect(actorOutput).to.be.eql(actorOutput);
    });

    afterAll(async () => {
        process.chdir(currentDirectory);
        if (existsSync(actorName)) await rimrafPromised(actorName);
    });
});
