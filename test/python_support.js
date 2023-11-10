const fs = require('fs');
const path = require('path');

const command = require('@oclif/core');
const { expect } = require('chai');
const loadJson = require('load-json-file');

const { rimrafPromised } = require('../src/lib/files');
const { getLocalKeyValueStorePath, detectPythonVersion } = require('../src/lib/utils');

const actorName = 'my-python-actor';
const PYTHON_START_TEMPLATE_ID = 'python-start';

describe('Python support [python]', () => {
    let currentDirectory;

    before(async () => {
        currentDirectory = process.cwd();
    });

    it('Python templates work [python]', async () => {
        const pythonVersion = detectPythonVersion('.');
        // Don't fail this test when Python is not installed (it will be installed in the right CI workflow)
        if (!pythonVersion && !process.env.CI) {
            console.log('Skipping Python template test since Python is not installed');
            return;
        }

        await command.run(['create', actorName, '--template', PYTHON_START_TEMPLATE_ID]);

        // Check file structure
        /* eslint-disable no-unused-expressions */
        expect(fs.existsSync(actorName)).to.be.true;
        process.chdir(actorName);

        expect(fs.existsSync('.venv')).to.be.true;
        expect(fs.existsSync('requirements.txt')).to.be.true;

        const expectedOutput = {
            hello: 'world',
        };

        const actorCode = `from apify import Actor
async def main():
    async with Actor:
        await Actor.set_value('OUTPUT', ${JSON.stringify(expectedOutput)})
`;
        fs.writeFileSync(path.join('src', 'main.py'), actorCode, { flag: 'w' });

        await command.run(['run']);

        // Check actor output
        const actorOutputPath = path.join(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actorOutput = loadJson.sync(actorOutputPath);
        expect(actorOutput).to.be.eql(actorOutput);
    });

    after(async () => {
        process.chdir(currentDirectory);
        if (fs.existsSync(actorName)) await rimrafPromised(actorName);
    });
});
