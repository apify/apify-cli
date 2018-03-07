const { getLocalConfig, setLocalConfig, getLoggedClientOrError, isUserLogged } = require('../lib/configs');
const gitignore = require('parse-gitignore');
const globby = require('globby');
const archiver = require('archiver-promise');
const util = require('util');
const fs = require('fs');
const { run, success, info } = require('../lib/outputs');


const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const UPLOADS_STORE_NAME = 'apify-cli-uploads';

module.exports = async (args) => {
    const actName = args._.shift(); // TODO
    const apifyClient = await getLoggedClientOrError();
    const localConfig = await getLocalConfig();
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
    const versionNumber = localConfig.versionNumber || '0.1';
    const store = await apifyClient.keyValueStores.getOrCreateStore({ storeName: UPLOADS_STORE_NAME });
    const key = `${localConfig.name}-${versionNumber}-${Date.now()}.zip`;
    const buffer = await util.promisify(fs.readFile)(TEMP_ZIP_FILE_NAME);
    await apifyClient.keyValueStores.putRecord({
        storeId: store.id,
        key,
        body: buffer,
        contentType: 'application/zip',
    });
    await util.promisify(fs.unlink)(TEMP_ZIP_FILE_NAME);
    // Update act and build
    const act = { name: localConfig.name, };
    const currentVersion = {
        versionNumber: versionNumber,
        buildTag: 'latest',
        sourceType: 'TARBALL',
        tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}?disableRedirect=true`,
    };
    if (localConfig.actId) {
        // Act was created yet
        // TODO: case when act doesn't exist
        const actData = await apifyClient.acts.getAct({ actId: localConfig.actId });
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
        await apifyClient.acts.updateAct({ actId: localConfig.actId, act });
    } else {
        act.versions = [currentVersion];
        run('Creating act ...');
        const newAct = await apifyClient.acts.createAct({ act });
        localConfig.actId = (newAct.username) ? `${newAct.username}/${newAct.name}` : newAct.id;
    }
    localConfig.versionNumber = versionNumber;
    await setLocalConfig(localConfig);
    run('Building act ...');
    await apifyClient.acts.buildAct({ actId: localConfig.actId, version: localConfig.versionNumber });
    success('Act was push to Apify!');
};
