const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const path = require('path');
const writeJson = require('write-json-file');
const loadJson = require('load-json-file');
const { ENV_VARS } = require('apify-shared/consts');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { testUserClient } = require('./config');
const { getLocalKeyValueStorePath, getLocalDatasetPath, getLocalRequestQueuePath, getLocalStorageDir } = require('../../src/lib/utils');


const actName = 'my-act';

describe('apify run', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        await command.run(['create', actName, '--template', 'hello_world']);
        process.chdir(actName);
    });

    it('run act with output', async () => {
        const expectOutput = {
            my: 'output',
        };
        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {
            const input = await Apify.getInput();

            const output = ${JSON.stringify(expectOutput)};
            await Apify.setValue('OUTPUT', output);
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

    it('run with env vars from apify.json', async () => {
        const { token } = testUserClient.getOptions();
        const testEnvVars = {
            TEST_LOCAL: 'testValue',
        };

        await command.run(['login', '--token', token]);

        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {
            await Apify.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });
        const apifyJson = loadJson.sync('apify.json');
        apifyJson.env = testEnvVars;
        writeJson.sync('apify.json', apifyJson);

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
        const Apify = require('apify');

        Apify.main(async () => {
            await Apify.setValue('TEST', process.env);
            await Apify.pushData({aa: "bb" });
            const requestQueue = await Apify.openRequestQueue();
            await requestQueue.addRequest(new Apify.Request({ url: 'http://example.com/' }));
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run']);

        expect(fs.existsSync(actInputPath)).to.be.eql(true);
        expect(fs.existsSync(testJsonPath)).to.be.eql(true);
        expect(fs.existsSync(getLocalDatasetPath())).to.be.eql(true);
        expect(fs.existsSync(getLocalRequestQueuePath())).to.be.eql(true);

        actCode = `
        const Apify = require('apify');

        Apify.main(async () => {});
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
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
