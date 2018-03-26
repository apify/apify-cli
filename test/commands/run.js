const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const path = require('path');
const { APIFY_LOCAL_EMULATION_DIR, APIFY_DEFAULT_KEY_VALUE_STORE_ID,
    APIFY_LOCAL_KEY_VALUE_STORES_DIR } = require('../../cli/lib/consts');
const { rimrafPromised } = require('../../cli/lib/files');
const loadJSON = require('load-json-file');

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
        const actOutputPath = path.join(APIFY_LOCAL_EMULATION_DIR, APIFY_LOCAL_KEY_VALUE_STORES_DIR, APIFY_DEFAULT_KEY_VALUE_STORE_ID, 'OUTPUT.json');
        const actOutput = loadJSON.sync(actOutputPath);
        expect(actOutput).to.be.eql(expectOutput);
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
