const { getLocalConfig, setLocalConfig, getLoggedClientOrError } = require('../utils/configs');
const gitignore = require('parse-gitignore');
const globby = require('globby');
const archiver = require('archiver-promise');
const fs = require('fs');
const { run, success, info } = require('../utils/outputs');
const { argsToCamelCase } = require('../utils/configs');


const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const UPLOADS_STORE_NAME = 'apify-cli-uploads';

module.exports = async (args) => {
    const apifyClient = await getLoggedClientOrError();
    const localConfig = await getLocalConfig();
    const cmdArgs = argsToCamelCase(args);

    let actId = args._.shift() || localConfig.actId;
    const versionNumber = cmdArgs.versionNumber || localConfig.versionNumber || '0.1';
    const buildTag = cmdArgs.buildTag || localConfig.buildTag || 'latest';

    info(`Push ${localConfig.name} to Apify.`);

    // Create zip
    run('Zipping all act files ...');
    const excludedPaths = gitignore('.gitignore').map(patern => `!${patern}`);
    const pathsToZip = await globby(['*', '*/**', ...excludedPaths]);
    const archive = archiver(TEMP_ZIP_FILE_NAME);
    for (const path of pathsToZip) {
        await archive.glob(path);
    }
    await archive.finalize();

    // Upload it to Apify.keyValueStores
    const store = await apifyClient.keyValueStores.getOrCreateStore({ storeName: UPLOADS_STORE_NAME });
    const key = `${localConfig.name}-${versionNumber}-${Date.now()}.zip`;
    const buffer = fs.readFileSync(TEMP_ZIP_FILE_NAME);
    await apifyClient.keyValueStores.putRecord({
        storeId: store.id,
        key,
        body: buffer,
        contentType: 'application/zip',
    });
    fs.unlinkSync(TEMP_ZIP_FILE_NAME);

    // Update act on Apify
    const act = { name: localConfig.name, };
    const currentVersion = {
        versionNumber,
        buildTag,
        sourceType: 'TARBALL',
        tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}?disableRedirect=true`,
    };
    if (actId) {
        // Act was created yet or actId was passed
        const actData = await apifyClient.acts.getAct({ actId });
        if (!actData) throw new Error(`Act with id ${actId} doesn't exist!`);
        let foundVersion = false;
        act.versions = actData.versions.map((version)=> {
            if (version.versionNumber === currentVersion.versionNumber) {
                foundVersion = true;
                return currentVersion;
            }
            return version;
        });
        if (!foundVersion) actData.versions.push(currentVersion);
        run('Updating act ...');
        await apifyClient.acts.updateAct({ actId, act });
    } else {
        act.versions = [currentVersion];
        run('Creating act ...');
        const newAct = await apifyClient.acts.createAct({ act });
        actId = (newAct.username) ? `${newAct.username}/${newAct.name}` : newAct.id;
        localConfig.actId = actId;
    }
    await setLocalConfig({ actId, buildTag, versionNumber });

    // Build act on Apify
    run('Building act ...');
    await apifyClient.acts.buildAct({
        actId,
        version: versionNumber,
        waitForFinish: 120,
        useCache: true
    });
    success('Act was push to Apify!');
};
