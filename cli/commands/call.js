const { getLocalConfig, getLoggedClientOrError } = require('../lib/utils');

module.exports = async (args) => {
    const localConfig = await getLocalConfig();
    const actId = args._.shift() || localConfig.actId;
    if (!actId) throw new Error('ActId is missing');

    const apifyClient = await getLoggedClientOrError();

    await apifyClient.acts.runAct({ actId });

    success('Act finished!');
};
