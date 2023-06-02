const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const path = require('path');
const writeJson = require('write-json-file');
const loadJson = require('load-json-file');
const { ENV_VARS } = require('@apify/consts');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH, LOCAL_CONFIG_PATH, EMPTY_LOCAL_CONFIG } = require('../../src/lib/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { TEST_USER_TOKEN } = require('./config');
const { getLocalKeyValueStorePath, getLocalDatasetPath, getLocalRequestQueuePath, getLocalStorageDir } = require('../../src/lib/utils');

const actName = 'my-act';

describe('apify run', () => {
    let skipAfterHook = false;
    before(async () => {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, directory ${GLOBAL_CONFIGS_FOLDER} exists! Run "apify logout" to fix this.`);
        }

        await command.run(['create', actName, '--template', 'project_empty']);
        process.chdir(actName);
    });

    it('run act with output', async () => {
        const expectOutput = {
            my: 'output',
        };
        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            const input = await Actor.getInput();

            const output = ${JSON.stringify(expectOutput)};
            await Actor.setValue('OUTPUT', output);
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run']);

        // check act output
        const actOutputPath = path.join(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actOutput = loadJson.sync(actOutputPath);
        expect(actOutput).to.be.eql(expectOutput);
    });

    it(`run with env vars from "${LOCAL_CONFIG_PATH}"`, async () => {
        const testEnvVars = {
            TEST_LOCAL: 'testValue',
        };

        await command.run(['login', '--token', TEST_USER_TOKEN]);

        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });
        const apifyJson = EMPTY_LOCAL_CONFIG;
        apifyJson.environmentVariables = testEnvVars;
        writeJson.sync(LOCAL_CONFIG_PATH, apifyJson);

        await command.run(['run']);

        const actOutputPath = path.join(getLocalKeyValueStorePath(), 'OUTPUT.json');

        const localEnvVars = loadJson.sync(actOutputPath);
        const auth = loadJson.sync(AUTH_FILE_PATH);

        expect(localEnvVars[ENV_VARS.PROXY_PASSWORD]).to.be.eql(auth.proxy.password);
        expect(localEnvVars[ENV_VARS.USER_ID]).to.be.eql(auth.id);
        expect(localEnvVars[ENV_VARS.TOKEN]).to.be.eql(auth.token);
        expect(localEnvVars.TEST_LOCAL).to.be.eql(testEnvVars.TEST_LOCAL);

        await command.run(['logout']);
    });

    it('run purge stores', async () => {
        const input = {
            myInput: 'value',
        };
        const actInputPath = path.join(getLocalKeyValueStorePath(), 'INPUT.json');
        const testJsonPath = path.join(getLocalKeyValueStorePath(), 'TEST.json');

        writeJson.sync(actInputPath, input);

        let actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('TEST', process.env);
            await Actor.pushData({aa: "bb" });
            const requestQueue = await Actor.openRequestQueue();
            await requestQueue.addRequest({ url: 'http://example.com/' });
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run']);

        expect(fs.existsSync(actInputPath)).to.be.eql(true);
        expect(fs.existsSync(testJsonPath)).to.be.eql(true);
        expect(fs.existsSync(getLocalDatasetPath())).to.be.eql(true);
        expect(fs.existsSync(getLocalRequestQueuePath())).to.be.eql(true);

        actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {});
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run', '--purge']);

        expect(fs.existsSync(actInputPath)).to.be.eql(true);
        expect(fs.existsSync(testJsonPath)).to.be.eql(false);
        expect(fs.existsSync(getLocalDatasetPath())).to.be.eql(false);
        expect(fs.existsSync(getLocalRequestQueuePath())).to.be.eql(false);
    });

    it('run with purge works without storage folder', async () => {
        await rimrafPromised(getLocalStorageDir());
        try {
            await command.run(['run', '--purge']);
        } catch (err) {
            throw new Error('Can not run actor without storage folder!');
        }
    });

    after(async () => {
        if (skipAfterHook) return;
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
        await command.run(['logout']);
    });
});
