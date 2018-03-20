const { expect } = require('chai');
const fs = require('fs');
const init = require('../../cli/commands/init');
const { rimrafPromised } = require('../../cli/lib/files');
const { EMPTY_LOCAL_CONFIG } = require('../../cli/lib/consts');
const loadJSON = require('load-json-file');

const actName = 'my-act-init';

describe('apify init', () => {
    before(() => {
        // create folder for init project
        fs.mkdirSync(actName);
        process.chdir(actName);
    });

    it('create basic structure', async () => {
        await init({ _: [actName] });

        const apifyJsonPath = 'apify.json';
        expect(fs.existsSync(apifyJsonPath)).to.be.true;
        expect(loadJSON.sync(apifyJsonPath)).to.be.eql(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
