const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const path = require('path');
const { rimrafPromised } = require('../../src/lib/files');
const writeJson = require('write-json-file');
const loadJson = require('load-json-file');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { testUserClient } = require('./config');
const { LOCAL_ENV_VARS, DEFAULT_LOCAL_STORES_ID } = require('../../src/lib/consts');
const { LOCAL_EMULATION_SUBDIRS, DEFAULT_LOCAL_EMULATION_DIR, ENV_VARS } = require('apify-shared/consts');

const actName = 'my-act';

describe('apify run', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        await command.run(['create', actName, '--template', 'basic']);
        process.chdir(actName);
    });

    it('run act with output', async () => {
        const expectOutput = {
            my: 'output',
        };
        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {
            const input = await Apify.getValue('INPUT');
                
            const output = ${JSON.stringify(expectOutput)};
            await Apify.setValue('OUTPUT', output);
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run']);

        // check act output
        const actOutputPath = path.join(...[DEFAULT_LOCAL_EMULATION_DIR,
            LOCAL_EMULATION_SUBDIRS.keyValueStores,
            DEFAULT_LOCAL_STORES_ID,
            'OUTPUT.json']);
        const actOutput = loadJson.sync(actOutputPath);
        expect(actOutput).to.be.eql(expectOutput);
    });

    it('run with env vars', async () => {
        const { token } = testUserClient.getOptions();

        await command.run(['login', '--token', token]);

        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {    
            await Apify.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run']);

        const actOutputPath = path.join(...[DEFAULT_LOCAL_EMULATION_DIR,
            LOCAL_EMULATION_SUBDIRS.keyValueStores,
            DEFAULT_LOCAL_STORES_ID,
            'OUTPUT.json']);

        const localEnvVars = loadJson.sync(actOutputPath);
        const auth = loadJson.sync(AUTH_FILE_PATH);

        expect(localEnvVars[ENV_VARS.PROXY_PASSWORD]).to.be.eql(auth.proxy.password);
        expect(localEnvVars[ENV_VARS.USER_ID]).to.be.eql(auth.id);
        expect(localEnvVars[ENV_VARS.TOKEN]).to.be.eql(auth.token);
        Object.keys(LOCAL_ENV_VARS).forEach(envVar => expect(localEnvVars[envVar]).to.be.eql(LOCAL_ENV_VARS[envVar]));

        await command.run(['logout']);
    });


    it('run purge stores', async () => {
        const input = {
            myInput: 'value',
        };
        const kvsPath = path.join(DEFAULT_LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIRS.keyValueStores,
            DEFAULT_LOCAL_STORES_ID);
        const actInputPath = path.join(kvsPath, 'INPUT.json');
        const testJsonPath = path.join(kvsPath, 'TEST.json');
        const datasetPath = path.join(DEFAULT_LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIRS.datasets,
            DEFAULT_LOCAL_STORES_ID);
        const queuePath = path.join(DEFAULT_LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIRS.requestQueues,
            DEFAULT_LOCAL_STORES_ID);

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
        expect(fs.existsSync(datasetPath)).to.be.eql(true);
        expect(fs.existsSync(queuePath)).to.be.eql(true);

        actCode = `
        const Apify = require('apify');

        Apify.main(async () => {});
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        await command.run(['run', '--purge-stores']);

        expect(fs.existsSync(actInputPath)).to.be.eql(true);
        expect(fs.existsSync(testJsonPath)).to.be.eql(false);
        expect(fs.existsSync(datasetPath)).to.be.eql(false);
        expect(fs.existsSync(queuePath)).to.be.eql(false);

    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
