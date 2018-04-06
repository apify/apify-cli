const fs = require('fs');
const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { getLocalConfig, setLocalConfig, getLoggedClientOrError } = require('../lib/utils');
const { run, success, info } = require('../lib/outputs');
const { createActZip } = require('../lib/utils');
const { ACT_TASK_STATUSES } = require('apify-shared/consts');
const { DEFAULT_ACT_TEMPLATE, ACTS_TEMPLATES } = require('../lib/consts');
const outputs = require('../lib/outputs');

const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const UPLOADS_STORE_NAME = 'apify-cli-deployments';

class PushCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(PushCommand);
        const apifyClient = await getLoggedClientOrError();
        const localConfig = await getLocalConfig();

        // User can override actId of pushing act.
        // It causes that we push act to this id but actId and name in localConfig will remain same.
        let actId = args.actId || localConfig.actId;
        const versionNumber = flags.versionNumber || localConfig.version.versionNumber;
        const buildTag = flags.buildTag || localConfig.version.buildTag;

        info(`Deploying act '${localConfig.name}' to Apify.`);

        // Create zip
        run('Zipping act files');
        await createActZip(TEMP_ZIP_FILE_NAME);

        // Upload it to Apify.keyValueStores
        const store = await apifyClient.keyValueStores.getOrCreateStore({ storeName: UPLOADS_STORE_NAME });
        const key = `${localConfig.name}-${versionNumber}.zip`;
        const buffer = fs.readFileSync(TEMP_ZIP_FILE_NAME);
        await apifyClient.keyValueStores.putRecord({
            storeId: store.id,
            key,
            body: buffer,
            contentType: 'application/zip',
        });
        fs.unlinkSync(TEMP_ZIP_FILE_NAME);

        // Update act on Apify
        const currentVersion = Object.assign(localConfig.version, {
            versionNumber,
            buildTag,
            tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}?disableRedirect=true`,
        });

        // TODO: we really need API endpoint that only updates one version!
        if (actId) {
            const updates = {};
            // Act was created yet or actId was passed
            const actData = await apifyClient.acts.getAct({ actId });
            if (!actData) throw new Error(`Act with ID '${actId}' does not exist!`);
            let foundVersion = false;
            updates.versions = actData.versions.map((version) => {
                if (version.versionNumber === currentVersion.versionNumber) {
                    foundVersion = true;
                    return currentVersion;
                }
                return version;
            });
            if (!foundVersion) updates.versions.push(currentVersion);
            run('Updating existing act');
            const updatedAct = await apifyClient.acts.updateAct({ actId, act: updates });
            console.dir(updatedAct);
        } else {
            const actTemplate = localConfig.template || DEFAULT_ACT_TEMPLATE;
            const newAct = {
                name: localConfig.name,
                defaultRunOptions: ACTS_TEMPLATES[actTemplate].defaultRunOptions,
                versions: [currentVersion],
            };
            run('Creating act');
            const createdAct = await apifyClient.acts.createAct({ act: newAct });
            actId = (createdAct.username) ? `${createdAct.username}/${createdAct.name}` : createdAct.id;
            // Set up new actId to localConfig
            localConfig.actId = actId;
            console.dir(createdAct);
        }

        await setLocalConfig(Object.assign(localConfig, { version: currentVersion }));

        // Build act on Apify
        run('Building act');
        const build = await apifyClient.acts.buildAct({
            actId,
            version: versionNumber,
            waitForFinish: 120,
            useCache: true,
        });

        if (build.status === ACT_TASK_STATUSES.SUCCEEDED) {
            console.dir(build);
            success('Act was deployed to Apify platform and built there.');
        } else {
            console.dir(build);
            outputs.error('Build failed! Log:');
            console.log(await apifyClient.logs.getLog({ logId: build.id }));
        }
    }
}

PushCommand.description = 'Uploads the act to the Apify platform and builds it there.\n'
    + 'The command creates a ZIP with files of the act from the current directory, uploads it to the Apify platform and builds it. The '
    + 'act settings are read from the "apify.json" file in the current directory, but they can be overridden using command-line options.\n\n'
    + 'WARNING: If the target act already exists in your Apify account, it will be overwritten!';

PushCommand.flags = {
    'version-number': flagsHelper.string({
        char: 'v',
        description: 'Act version number to which the files should be pushed. By default, it is taken from the "apify.json" file.',
        required: false,
    }),
    'build-tag': flagsHelper.string({
        char: 'b',
        description: 'Build tag to be applied to the successful act build. By default, it is taken from the "apify.json" file',
        required: false,
    }),
};

PushCommand.args = [
    {
        name: 'actId',
        required: false,
        description: 'ID of an existing act on the Apify platform where the files will be pushed. ' +
        'If not provided, the command will create or modify the act with the name specified in "apify.json" file.',
    },
];

module.exports = PushCommand;
