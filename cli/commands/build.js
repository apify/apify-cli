const { getLocalConfig, setLocalConfig } = require('../lib/configs');
const ApifyClient = require('apify-client');

module.exports = async (args, config) => {
    const localConfig = await getLocalConfig();
    if (!localConfig || !localConfig.id) return; //TODO
    const apifyClient = new ApifyClient(config);
    const build = await apifyClient.acts.buildAct({ actId: localConfig.id, version: localConfig.versions[0].versionNumber });
    console.log(build);
};