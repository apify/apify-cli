const { getLocalConfig, getLocalInput } = require('../lib/configs');
const ApifyClient = require('apify-client');

module.exports = async (args, config) => {
    const localConfig = await getLocalConfig();
    if (!localConfig || !localConfig.id) return; //TODO
    const apifyClient = new ApifyClient(config);
    const body = await getLocalInput();
    const run = await apifyClient.acts.runAct({ actId: localConfig.id, body , contentType: 'application/json; charset=utf-8' });
    console.log(run);
};