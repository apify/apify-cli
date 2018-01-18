const { getLocalConfig, setLocalConfig } = require('../lib/configs');
const ApifyClient = require('apify-client');

module.exports = async (args, config) => {
    const localConfig = await getLocalConfig();
    if (!localConfig || !localConfig.name) return; //TODO
    const apifyClient = new ApifyClient(config);
    if (localConfig.id) {
        const fieldsToUpdate = { versions: localConfig.versions };
        const act = await apifyClient.acts.updateAct({ actId: localConfig.id, act: fieldsToUpdate });
        console.log(act);
    } else {
        // init push
        const act = await apifyClient.acts.createAct({ act: localConfig });
        console.log(act);
        await setLocalConfig(act);
    }
};