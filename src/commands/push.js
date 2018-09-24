const fs = require('fs');
const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { getLocalConfigOrThrow, setLocalConfig, getLoggedClientOrThrow, outputLogStream } = require('../lib/utils');
const { createActZip } = require('../lib/utils');
const { ACT_TASK_STATUSES } = require('apify-shared/consts');
const { DEFAULT_ACT_TEMPLATE, ACTS_TEMPLATES } = require('../lib/consts');
const outputs = require('../lib/outputs');

const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const UPLOADS_STORE_NAME = 'apify-cli-deployments';

class PushCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(PushCommand);
        const apifyClient = await getLoggedClientOrThrow();
        const localConfig = getLocalConfigOrThrow();

        // User can override actId of pushing actor.
        // It causes that we push actor to this id but actId and name in localConfig will remain same.
        let actId = args.actId || localConfig.actId;
        const versionNumber = flags.versionNumber || localConfig.version.versionNumber;
        const buildTag = flags.buildTag || localConfig.version.buildTag;
        const waitForFinishMillis = Number.isNaN(flags.waitForFinish)
            ? undefined
            : parseInt(flags.waitForFinish, 10) * 1000;

        outputs.info(`Deploying actor '${localConfig.name}' to Apify.`);

        // Create zip
        outputs.run('Zipping actor files');
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

        // Update actor on Apify
        const currentVersion = Object.assign(localConfig.version, {
            versionNumber,
            buildTag,
            tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}?disableRedirect=true`,
        });

        // TODO: we really need API endpoint that only updates one version!
        if (actId) {
            const updates = {};
            // Actor was created yet or actId was passed
            const actData = await apifyClient.acts.getAct({ actId });
            if (!actData) throw new Error(`Cannot find actor with ID '${actId}' in your account.`);
            let foundVersion = false;
            updates.versions = actData.versions.map((version) => {
                if (version.versionNumber === currentVersion.versionNumber) {
                    foundVersion = true;
                    return currentVersion;
                }
                return version;
            });
            if (!foundVersion) updates.versions.push(currentVersion);
            outputs.run('Updating existing actor');
            const updatedAct = await apifyClient.acts.updateAct({ actId, act: updates });
            console.dir(updatedAct);
        } else {
            const actTemplate = localConfig.template || DEFAULT_ACT_TEMPLATE;
            const newAct = {
                name: localConfig.name,
                defaultRunOptions: ACTS_TEMPLATES[actTemplate].defaultRunOptions,
                versions: [currentVersion],
            };
            outputs.run('Creating actor');
            const createdAct = await apifyClient.acts.createAct({ act: newAct });
            actId = (createdAct.username) ? `${createdAct.username}/${createdAct.name}` : createdAct.id;
            // Set up new actId to localConfig
            localConfig.actId = actId;
            console.dir(createdAct);
        }

        await setLocalConfig(Object.assign(localConfig, { version: currentVersion }));

        // Build actor on Apify and wait for build finish
        outputs.run('Building actor');
        let build = await apifyClient.acts.buildAct({
            actId,
            version: versionNumber,
            useCache: true,
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        });

        try {
            await outputLogStream(build.id, waitForFinishMillis);
        } catch (err) {
            outputs.warning('Can not get log:');
            console.error(err);
        }

        build = await apifyClient.acts.getBuild({ actId: build.actId, buildId: build.id });
        console.dir(build);

        outputs.link('Actor build detail', `https://my.apify.com/actors/${build.actId}#/builds/${build.buildNumber}`);

        if (build.status === ACT_TASK_STATUSES.SUCCEEDED) {
            outputs.success('Actor was deployed to Apify platform and built there.');
        } else if (build.status === ACT_TASK_STATUSES.RUNNING) {
            outputs.warning('Build is still running!');
        } else {
            outputs.error('Build failed!');
        }
    }
}

PushCommand.description = 'Uploads the actor to the Apify platform and builds it there.\n'
    + 'The command creates a ZIP with files of the actor from the current directory, uploads it to the Apify platform and builds it. The '
    + 'actor settings are read from the "apify.json" file in the current directory, but they can be overridden using command-line options.\n\n'
    + 'WARNING: If the target actor already exists in your Apify account, it will be overwritten!';

PushCommand.flags = {
    'version-number': flagsHelper.string({
        char: 'v',
        description: 'Actor version number to which the files should be pushed. By default, it is taken from the "apify.json" file.',
        required: false,
    }),
    'build-tag': flagsHelper.string({
        char: 'b',
        description: 'Build tag to be applied to the successful actor build. By default, it is taken from the "apify.json" file',
        required: false,
    }),
    'wait-for-finish': flagsHelper.string({
        char: 'w',
        description: 'Seconds for waiting to build to finish, if no value passed, it waits forever.',
        required: false,
    }),
};

PushCommand.args = [
    {
        name: 'actId',
        required: false,
        description: 'ID of an existing actor on the Apify platform where the files will be pushed. ' +
        'If not provided, the command will create or modify the actor with the name specified in "apify.json" file.',
    },
];

module.exports = PushCommand;
