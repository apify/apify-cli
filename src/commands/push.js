const fs = require('fs');
const { flags: flagsHelper } = require('@oclif/command');
const actorTemplates = require('@apify/actor-templates');
const { ACT_JOB_STATUSES, ACT_SOURCE_TYPES,
    MAX_MULTIFILE_BYTES } = require('apify-shared/consts');
const { ApifyCommand } = require('../lib/apify_command');
const { createActZip, getLoggedClientOrThrow,
    outputJobLog, getLocalUserInfo, getActorLocalFilePaths,
    createSourceFiles, getLocalConfigOrThrow } = require('../lib/utils');
const { sumFilesSizeInBytes } = require('../lib/files');
const { UPLOADS_STORE_NAME } = require('../lib/consts');
const { transformEnvToEnvVars } = require('../lib/secrets');
const outputs = require('../lib/outputs');

const TEMP_ZIP_FILE_NAME = 'temp_file.zip';

class PushCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(PushCommand);
        const apifyClient = await getLoggedClientOrThrow();
        const localConfig = await getLocalConfigOrThrow();
        const userInfo = await getLocalUserInfo();

        let actorId;
        let actor;
        // User can override actor version and build tag, attributes in localConfig will remain same.
        const version = flags.version || flags.versionNumber || localConfig.version;
        const buildTag = flags.buildTag || localConfig.buildTag;
        const waitForFinishMillis = Number.isNaN(flags.waitForFinish)
            ? undefined
            : parseInt(flags.waitForFinish, 10) * 1000;
        // User can override actorId of pushing actor.
        // It causes that we push actor to this id but attributes in localConfig will remain same.
        const forceActorId = args.actorId;
        if (forceActorId) {
            actor = await apifyClient.actor(forceActorId).get();
            if (!actor) throw new Error(`Cannot find actor with ID '${forceActorId}' in your account.`);
            actorId = actor.id;
        } else {
            const usernameOrId = userInfo.username || userInfo.id;
            actor = await apifyClient.actor(`${usernameOrId}/${localConfig.name}`).get();
            if (actor) {
                actorId = actor.id;
            } else {
                const { templates } = await actorTemplates.fetchManifest();
                let actorTemplate = templates.find((t) => t.name === localConfig.template);
                if (!actorTemplate) [actorTemplate] = templates;
                const newActor = {
                    name: localConfig.name,
                    defaultRunOptions: actorTemplate.defaultRunOptions,
                    versions: [{
                        versionNumber: version,
                        buildTag,
                        sourceType: ACT_SOURCE_TYPES.TARBALL,
                        tarballUrl: actorTemplate.archiveUrl,
                    }],
                };
                actor = await apifyClient.actors().create(newActor);
                actorId = actor.id;
                outputs.info(`Created actor with name ${localConfig.name} on Apify.`);
                console.dir(actor);
            }
        }

        outputs.info(`Deploying actor '${localConfig.name}' to Apify.`);

        const filePathsToPush = await getActorLocalFilePaths();
        const filesSize = await sumFilesSizeInBytes(filePathsToPush);
        const actorClient = apifyClient.actor(actor.id);

        let sourceType;
        let sourceFiles;
        let tarballUrl;
        if (filesSize < MAX_MULTIFILE_BYTES) {
            sourceFiles = await createSourceFiles(filePathsToPush);
            sourceType = ACT_SOURCE_TYPES.SOURCE_FILES;
        } else {
            // Create zip
            outputs.run('Zipping actor files');
            await createActZip(TEMP_ZIP_FILE_NAME, filePathsToPush);

            // Upload it to Apify.keyValueStores
            const store = await apifyClient.keyValueStores().getOrCreate(UPLOADS_STORE_NAME);
            const key = `${actor.name}-${version}.zip`;
            const buffer = fs.readFileSync(TEMP_ZIP_FILE_NAME);
            await apifyClient.keyValueStore(store.id).setRecord({
                key,
                body: buffer,
                contentType: 'application/zip',
            });
            fs.unlinkSync(TEMP_ZIP_FILE_NAME);
            tarballUrl = `https://api.apify.com/v2/key-value-stores/${store.id}/records/${key}?disableRedirect=true`;
            sourceType = ACT_SOURCE_TYPES.TARBALL;
        }

        // Update actor version
        const actorCurrentVersion = await actorClient.version(version).get();
        if (actorCurrentVersion) {
            const actorVersionModifier = { tarballUrl, sourceFiles, buildTag, sourceType };
            if (localConfig.env) actorVersionModifier.envVars = transformEnvToEnvVars(localConfig.env);
            await actorClient.version(version).update(actorVersionModifier);
            outputs.run(`Updated version ${version} for ${actor.name} actor.`);
        } else {
            const actorNewVersion = {
                versionNumber: version,
                tarballUrl,
                sourceFiles,
                buildTag,
                sourceType,
            };
            if (localConfig.env) actorNewVersion.envVars = transformEnvToEnvVars(localConfig.env);
            await actorClient.versions().create({
                versionNumber: version,
                ...actorNewVersion,
            });
            outputs.run(`Created version ${version} for ${actor.name} actor.`);
        }

        // Build actor on Apify and wait for build to finish
        outputs.run(`Building actor ${actor.name}`);
        let build = await actorClient.build(version, {
            useCache: true,
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        });

        try {
            await outputJobLog(build, waitForFinishMillis);
        } catch (err) {
            outputs.warning('Can not get log:');
            console.error(err);
        }

        build = await apifyClient.build(build.id).get();
        console.dir(build);

        outputs.link('Actor build detail', `https://console.apify.com/actors/${build.actId}#/builds/${build.buildNumber}`);

        if (build.status === ACT_JOB_STATUSES.SUCCEEDED) {
            outputs.success('Actor was deployed to Apify cloud and built there.');
        } else if (build.status === ACT_JOB_STATUSES.RUNNING) {
            outputs.warning('Build is still running!');
        } else {
            outputs.error('Build failed!');
        }
    }
}

PushCommand.description = 'Uploads the actor to the Apify platform and builds it there.\n'
    + 'The actor settings are read from the "apify.json" file in the current directory, but they can be overridden using command-line options.\n'
    + `NOTE: If the source files are smaller than ${MAX_MULTIFILE_BYTES / (1024 ** 2)} MB then they are uploaded as \n`
    + '"Multiple source files", otherwise they are uploaded as "Zip file".\n\n'
    + 'WARNING: If the target actor already exists in your Apify account, it will be overwritten!';

PushCommand.flags = {
    'version-number': flagsHelper.string({
        description: 'DEPRECATED: Use flag version instead. Actor version number to which the files should be pushed. '
            + 'By default, it is taken from the "apify.json" file.',
        required: false,
    }),
    version: flagsHelper.string({
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
        name: 'actorId',
        required: false,
        description: 'ID of an existing actor on the Apify platform where the files will be pushed. '
        + 'If not provided, the command will create or modify the actor with the name specified in "apify.json" file.',
    },
];

module.exports = PushCommand;
