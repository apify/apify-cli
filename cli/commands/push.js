const { getLocalConfig, setLocalConfig } = require('../lib/configs');
const ApifyClient = require('apify-client');

module.exports = async (args, config) => {
    const localConfig = await getLocalConfig();
    if (!localConfig || !localConfig.name) return; //TODO
    const apifyClient = new ApifyClient(config);
    if (localConfig.id) {
        // TODO
    } else {
        // init push
        console.log(localConfig)
        const act = await apifyClient.acts.createAct({ act: localConfig });
        console.log(act);
        await setLocalConfig(act);
    }
};