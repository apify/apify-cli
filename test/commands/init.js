const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const loadJson = require('load-json-file');
const { rimrafPromised } = require('../../src/lib/files');
const { EMPTY_LOCAL_CONFIG } = require('../../src/lib/consts');

const actName = 'my-act-init';

describe('apify init', () => {
    before(() => {
        // create folder for init project
        fs.mkdirSync(actName);
        process.chdir(actName);
    });

    it('correctly creates basic structure', async () => {
        await command.run(['init', actName]);

        const apifyJsonPath = 'apify.json';
        expect(fs.existsSync(apifyJsonPath)).to.be.true;
        expect(loadJson.sync(apifyJsonPath)).to.be.eql(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
