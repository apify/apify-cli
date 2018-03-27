// TODO: Make it works
// const { expect } = require('chai');
// const sinon = require('sinon');
// const fs = require('fs');
// const command = require('@oclif/command');
// const { rimrafPromised } = require('../../cli/lib/files');
// const loadJson = require('load-json-file');
// const { ACT_TASK_STATUSES } = require('apify-shared/consts');
// const { apifyClient } = require('../../cli/lib/utils');
//
//
// const storeId = 'my-store';
// const objectKey = 'my-key';
// const actName = 'my-act';
// const actVersion = {
//     versionNumber: '0.1',
//     buildTag: 'latest',
//     envVars: [],
//     sourceType: 'TARBALL',
//     tarballUrl: 'https://api.apify.com/v2/key-value-stores/6XZutK/keys/test.zip',
// };
// const act = {
//     name: actName,
//     versions: [actVersion]
// };
//
// describe('apify push', () => {
//     before(async () => {
//         await command.run(['create', actName, '--template', 'basic']);
//         process.chdir(actName);
//     });
//
//     beforeEach(() => {
//         sinon.spy(console, 'log');
//     });
//
//     it('push without actId', async () => {
//         sinon.stub(apifyClient.keyValueStores, 'getOrCreateStore').withArgs({ name: 'store-name' }).returns({ id: storeId });
//         sinon.stub(apifyClient.keyValueStores, 'putRecord').withArgs({ storeId, key: objectKey }).returns();
//         sinon.stub(apifyClient.acts, 'createAct').withArgs({ name: actName, versions: [actName] }).returns(act);
//         sinon.stub(apifyClient.acts, 'buildAct').withArgs({ actId: act.id }).returns({ status: ACT_TASK_STATUSES.SUCCEEDED});
//
//         command.run(['push']);
//
//         expect(loadJson.sync('apify.json')).to.be.eql({ actName, actId: act.id, version: actVersion });
//     });
//
//     it('push with actId', async () => {
//         sinon.stub(apifyClient.keyValueStores, 'putObject').withArgs({ storeId, key: objectKey }).returns(act);
//         sinon.stub(apifyClient.acts, 'createAct').withArgs({ name: actName, versions: [actName] }).returns(act);
//
//         await command.run(['init', actName]);
//
//         const apifyJsonPath = 'apify.json';
//         expect(fs.existsSync(apifyJsonPath)).to.be.true;
//         expect(loadJson.sync(apifyJsonPath)).to.be.eql(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
//     });
//
//     afterEach(() => {
//         console.log.restore();
//     });
//
//     after(async () => {
//         process.chdir('../');
//         if (fs.existsSync(actName)) await rimrafPromised(actName);
//     });
// });
