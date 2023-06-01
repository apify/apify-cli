const fs = require('fs');
const { flags: flagsHelper } = require('@oclif/command');
const actorTemplates = require('@apify/actor-templates');
const { ACT_JOB_STATUSES, ACT_SOURCE_TYPES,
    MAX_MULTIFILE_BYTES } = require('@apify/consts');
const open = require('open');
const inquirer = require('inquirer');
const { ApifyCommand } = require('../lib/apify_command');
const { createActZip, getLoggedClientOrThrow,
    outputJobLog, getLocalUserInfo, getActorLocalFilePaths,
    createSourceFiles, getLocalConfigOrThrow } = require('../lib/utils');
const { sumFilesSizeInBytes } = require('../lib/files');
const { UPLOADS_STORE_NAME, LOCAL_CONFIG_PATH } = require('../lib/consts');
const { transformEnvToEnvVars } = require('../lib/secrets');
const outputs = require('../lib/outputs');

const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const DEFAULT_RUN_OPTIONS = {
    build: 'latest',
    memoryMbytes: 4096,
    timeoutSecs: 3600,
};
const DEFAULT_ACTOR_VERSION_NUMBER = '0.0';

// It would be better to use `version-0.0` or similar,
// or even have no default tag, but the platform complains when
// actor does not have a build with a `latest` tag, so until
// that changes, we have to add it.
const DEFAULT_BUILD_TAG = 'latest';

class PushCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(PushCommand);
        const apifyClient = await getLoggedClientOrThrow();
        const localConfig = await getLocalConfigOrThrow();
        const userInfo = await getLocalUserInfo();
        const isOrganizationLoggedIn = !!userInfo.organizationOwnerUserId;
        const redirectUrlPart = isOrganizationLoggedIn ? `/organization/${userInfo.id}` : '';

        let actorId;
        let actor;
        // User can override actor version and build tag, attributes in localConfig will remain same.
        const version = flags.version || flags.versionNumber || localConfig.version || DEFAULT_ACTOR_VERSION_NUMBER;
        let buildTag = flags.buildTag || localConfig.buildTag;
        // We can't add the default build tag to everything. If a user creates a new
        // version, e.g. for testing, but forgets to add a tag, it would use the default
        // tag and their production runs might be affected ❌
        // TODO: revisit this when we have better build tagging system on platform.
        if (!buildTag && version === DEFAULT_ACTOR_VERSION_NUMBER) {
            buildTag = DEFAULT_BUILD_TAG;
        }
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
                const actorTemplate = templates.find((t) => t.name === localConfig.template);
                const defaultRunOptions = actorTemplate?.defaultRunOptions || DEFAULT_RUN_OPTIONS;
                const newActor = {
                    name: localConfig.name,
                    defaultRunOptions,
                    versions: [{
                        versionNumber: version,
                        buildTag,
                        sourceType: ACT_SOURCE_TYPES.SOURCE_FILES,
                        sourceFiles: [],
                    }],
                };
                actor = await apifyClient.actors().create(newActor);
                actorId = actor.id;
                outputs.info(`Created actor with name ${localConfig.name} on Apify.`);
            }
        }

        outputs.info(`Deploying actor '${localConfig.name}' to Apify.`);

        const filePathsToPush = await getActorLocalFilePaths();
        const filesSize = await sumFilesSizeInBytes(filePathsToPush);
        const actorClient = apifyClient.actor(actorId);

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
                value: buffer,
                contentType: 'application/zip',
            });
            fs.unlinkSync(TEMP_ZIP_FILE_NAME);
            tarballUrl = `${apifyClient.baseUrl}/key-value-stores/${store.id}/records/${key}?disableRedirect=true`;
            sourceType = ACT_SOURCE_TYPES.TARBALL;
        }

        // Update actor version
        const actorCurrentVersion = await actorClient.version(version).get();
        const envVars = localConfig.environmentVariables
            ? transformEnvToEnvVars(localConfig.environmentVariables)
            : undefined;
        if (actorCurrentVersion) {
            const actorVersionModifier = { tarballUrl, sourceFiles, buildTag, sourceType, envVars };
            await actorClient.version(version).update(actorVersionModifier);
            outputs.run(`Updated version ${version} for ${actor.name} actor.`);
        } else {
            const actorNewVersion = {
                versionNumber: version,
                tarballUrl,
                sourceFiles,
                buildTag,
                sourceType,
                envVars,
            };
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

        outputs.link('Actor build detail', `https://console.apify.com${redirectUrlPart}/actors/${build.actId}#/builds/${build.buildNumber}`);

        const shouldOpenBrowser = await inquirer.prompt([
            { type: 'confirm', name: 'continue', message: 'Do you want to open the actor detail in your browser?', default: true },
        ]);

        if (shouldOpenBrowser.continue) {
            open(`https://console.apify.com${redirectUrlPart}/actors/${build.actId}`);
        }

        if (build.status === ACT_JOB_STATUSES.SUCCEEDED) {
            outputs.success('Actor was deployed to Apify cloud and built there.');
        } else if (build.status === ACT_JOB_STATUSES.READY) {
            outputs.warning('Build is waiting for allocation.');
        } else if (build.status === ACT_JOB_STATUSES.RUNNING) {
            outputs.warning('Build is still running.');
        } else if (build.status === ACT_JOB_STATUSES.ABORTED || build.status === ACT_JOB_STATUSES.ABORTING) {
            outputs.warning('Build was aborted!');
        } else if (build.status === ACT_JOB_STATUSES.TIMED_OUT || build.status === ACT_JOB_STATUSES.TIMING_OUT) {
            outputs.warning('Build timed out!');
        } else {
            outputs.error('Build failed!');
        }
    }
}

PushCommand.description = 'Uploads the actor to the Apify platform and builds it there.\n'
    + `The actor settings are read from the "${LOCAL_CONFIG_PATH}" file in the current directory, but they can be overridden using command-line options.\n`
    + `NOTE: If the source files are smaller than ${MAX_MULTIFILE_BYTES / (1024 ** 2)} MB then they are uploaded as \n`
    + '"Multiple source files", otherwise they are uploaded as "Zip file".\n\n'
    + 'WARNING: If the target Actor already exists in your Apify account, it will be overwritten!';

PushCommand.flags = {
    'version-number': flagsHelper.string({
        description: 'DEPRECATED: Use flag version instead. Actor version number to which the files should be pushed. '
            + `By default, it is taken from the "${LOCAL_CONFIG_PATH}" file.`,
        required: false,
    }),
    version: flagsHelper.string({
        char: 'v',
        description: `Actor version number to which the files should be pushed. By default, it is taken from the "${LOCAL_CONFIG_PATH}" file.`,
        required: false,
    }),
    'build-tag': flagsHelper.string({
        char: 'b',
        description: `Build tag to be applied to the successful Actor build. By default, it is taken from the "${LOCAL_CONFIG_PATH}" file`,
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
        description: 'Name or ID of the actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). '
        + `If not provided, the command will create or modify the actor with the name specified in "${LOCAL_CONFIG_PATH}" file.`,
    },
];

module.exports = PushCommand;
