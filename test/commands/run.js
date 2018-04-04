const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const path = require('path');
const { LOCAL_ENV_VARS } = require('../../cli/lib/consts');
const { rimrafPromised } = require('../../cli/lib/files');
const loadJson = require('load-json-file');

const actName = 'my-act';

describe('apify run', () => {
    before(async () => {
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
        const actOutputPath = path.join(...[LOCAL_ENV_VARS.APIFY_LOCAL_EMULATION_DIR,
            LOCAL_ENV_VARS.APIFY_LOCAL_KEY_VALUE_STORES_DIR,
            LOCAL_ENV_VARS.APIFY_DEFAULT_KEY_VALUE_STORE_ID,
            'OUTPUT.json']);
        const actOutput = loadJson.sync(actOutputPath);
        expect(actOutput).to.be.eql(expectOutput);
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
