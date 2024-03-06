import { readFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { fetchManifest } from '@apify/actor-templates';
import { ACTOR_JOB_STATUSES, ACTOR_SOURCE_TYPES, MAX_MULTIFILE_BYTES } from '@apify/consts';
import { Args, Flags } from '@oclif/core';
import { Actor, ActorCollectionCreateOptions, ActorDefaultRunOptions } from 'apify-client';
import inquirer from 'inquirer';
import isCI from 'is-ci';
import open from 'open';

import { ApifyCommand } from '../lib/apify_command.js';
import { LOCAL_CONFIG_PATH, UPLOADS_STORE_NAME } from '../lib/consts.js';
import { sumFilesSizeInBytes } from '../lib/files.js';
import { error, info, link, run, success, warning } from '../lib/outputs.js';
import { transformEnvToEnvVars } from '../lib/secrets.js';
import {
    createActZip,
    createSourceFiles,
    getActorLocalFilePaths,
    getLocalConfigOrThrow,
    getLocalUserInfo,
    getLoggedClientOrThrow,
    outputJobLog,
} from '../lib/utils.js';

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

export class PushCommand extends ApifyCommand<typeof PushCommand> {
    static override description = 'Uploads the Actor to the Apify platform and builds it there.\n'
    + `The Actor settings are read from the "${LOCAL_CONFIG_PATH}" file in the current directory, but they can be overridden using command-line options.\n`
    + `NOTE: If the source files are smaller than ${MAX_MULTIFILE_BYTES / (1024 ** 2)} MB then they are uploaded as \n`
    + '"Multiple source files", otherwise they are uploaded as "Zip file".\n\n'
    + 'When there\'s an attempt to push files that are older than the Actor on the platform, the command will fail. Can be overwritten with --force flag.';

    static override flags = {
        'version-number': Flags.string({
            description: 'DEPRECATED: Use flag version instead. Actor version number to which the files should be pushed. '
            + `By default, it is taken from the "${LOCAL_CONFIG_PATH}" file.`,
            required: false,
            deprecated: true,
        }),
        version: Flags.string({
            char: 'v',
            description: `Actor version number to which the files should be pushed. By default, it is taken from the "${LOCAL_CONFIG_PATH}" file.`,
            required: false,
        }),
        'build-tag': Flags.string({
            char: 'b',
            description: `Build tag to be applied to the successful Actor build. By default, it is taken from the "${LOCAL_CONFIG_PATH}" file`,
            required: false,
        }),
        'wait-for-finish': Flags.string({
            char: 'w',
            description: 'Seconds for waiting to build to finish, if no value passed, it waits forever.',
            required: false,
        }),
        'no-prompt': Flags.boolean({
            description: 'Do not prompt for opening the Actor details in a browser. This will also not open the browser automatically.',
            default: false,
            required: false,
        }),
        force: Flags.boolean({
            description: 'Push an Actor even when the local files are older than the Actor on the platform.',
            default: false,
            required: false,
        }),
    };

    static override args = {
        actorId: Args.string({
            required: false,
            description: 'Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). '
                + `If not provided, the command will create or modify the Actor with the name specified in "${LOCAL_CONFIG_PATH}" file.`,
        }),
    };

    // TODO: Global handler in ApifyCommand
    override async catch(caughtError: Error) {
        throw caughtError;
    }

    async run() {
        const cwd = process.cwd();

        const apifyClient = await getLoggedClientOrThrow();
        const localConfig = await getLocalConfigOrThrow(cwd);
        const userInfo = await getLocalUserInfo();
        const isOrganizationLoggedIn = !!userInfo.organizationOwnerUserId;
        const redirectUrlPart = isOrganizationLoggedIn ? `/organization/${userInfo.id}` : '';

        let actorId: string;
        let actor: Actor;
        let isActorCreatedNow = false;
        // User can override actor version and build tag, attributes in localConfig will remain same.
        const version = this.flags.version || this.flags.versionNumber || localConfig?.version as string | undefined || DEFAULT_ACTOR_VERSION_NUMBER;
        let buildTag = this.flags.buildTag || localConfig!.buildTag as string | undefined;
        // We can't add the default build tag to everything. If a user creates a new
        // version, e.g. for testing, but forgets to add a tag, it would use the default
        // tag and their production runs might be affected ❌
        // TODO: revisit this when we have better build tagging system on platform.
        if (!buildTag && version === DEFAULT_ACTOR_VERSION_NUMBER) {
            buildTag = DEFAULT_BUILD_TAG;
        }
        const waitForFinishMillis = Number.isNaN(this.flags.waitForFinish)
            ? undefined
            : Number.parseInt(this.flags.waitForFinish!, 10) * 1000;
        // User can override actorId of pushing actor.
        // It causes that we push actor to this id but attributes in localConfig will remain same.
        const forceActorId = this.args.actorId;

        if (forceActorId) {
            actor = (await apifyClient.actor(forceActorId).get())!;
            if (!actor) throw new Error(`Cannot find Actor with ID '${forceActorId}' in your account.`);
            actorId = actor.id;
        } else {
            const usernameOrId = userInfo.username || userInfo.id;
            actor = (await apifyClient.actor(`${usernameOrId}/${localConfig!.name}`).get())!;
            if (actor) {
                actorId = actor.id;
            } else {
                const { templates } = await fetchManifest();
                const actorTemplate = templates.find((t) => t.name === localConfig!.template);
                const defaultRunOptions = (actorTemplate?.defaultRunOptions || DEFAULT_RUN_OPTIONS) as ActorDefaultRunOptions;
                const newActor: ActorCollectionCreateOptions = {
                    name: localConfig!.name as string,
                    defaultRunOptions,
                    versions: [{
                        versionNumber: version,
                        buildTag,
                        // TODO: export enum from apify-client
                        sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES as never,
                        sourceFiles: [],
                    }],
                };
                actor = await apifyClient.actors().create(newActor);
                actorId = actor.id;
                isActorCreatedNow = true;
                info(`Created Actor with name ${localConfig!.name} on Apify.`);
            }
        }

        info(`Deploying Actor '${localConfig!.name}' to Apify.`);

        const filePathsToPush = await getActorLocalFilePaths(cwd);
        const filesSize = await sumFilesSizeInBytes(filePathsToPush, cwd);
        const actorClient = apifyClient.actor(actorId);

        let sourceType;
        let sourceFiles;
        let tarballUrl;
        if (filesSize < MAX_MULTIFILE_BYTES) {
            const client = await actorClient.get();

            if (!isActorCreatedNow) {
                // Check when was files modified last
                const mostRecentModifiedFileMs = filePathsToPush.reduce((modifiedMs, filePath) => {
                    const { mtimeMs, ctimeMs } = statSync(join(cwd, filePath));

                    // Sometimes it's possible mtimeMs is some messed up value (like 2000/01/01 midnight), then we want to check created if it's newer
                    const fileModifiedMs = mtimeMs > ctimeMs ? mtimeMs : ctimeMs;

                    return modifiedMs > fileModifiedMs ? modifiedMs : fileModifiedMs;
                }, 0);
                const actorModifiedMs = client?.modifiedAt.valueOf();

                if (!this.flags.force && actorModifiedMs && mostRecentModifiedFileMs < actorModifiedMs && (forceActorId || localConfig?.name)) {
                    throw new Error(
                        `Actor with name "${localConfig?.name}" is already on the platform and was modified there since modified locally.
                    Skipping push. Use --force to override.`,
                    );
                }
            }

            sourceFiles = await createSourceFiles(filePathsToPush, cwd);
            sourceType = ACTOR_SOURCE_TYPES.SOURCE_FILES;
        } else {
            // Create zip
            run('Zipping Actor files');
            await createActZip(TEMP_ZIP_FILE_NAME, filePathsToPush, cwd);

            // Upload it to Apify.keyValueStores
            const store = await apifyClient.keyValueStores().getOrCreate(UPLOADS_STORE_NAME);
            const key = `${actor.name}-${version}.zip`;
            const buffer = readFileSync(TEMP_ZIP_FILE_NAME);
            await apifyClient.keyValueStore(store.id).setRecord({
                key,
                // TODO: fix this type too
                value: buffer as never,
                contentType: 'application/zip',
            });
            unlinkSync(TEMP_ZIP_FILE_NAME);
            tarballUrl = `${apifyClient.baseUrl}/key-value-stores/${store.id}/records/${key}?disableRedirect=true`;
            sourceType = ACTOR_SOURCE_TYPES.TARBALL;
        }

        // Update actor version
        const actorCurrentVersion = await actorClient.version(version).get();
        const envVars = localConfig!.environmentVariables
            ? transformEnvToEnvVars(localConfig!.environmentVariables as Record<string, string>)
            : undefined;
        if (actorCurrentVersion) {
            const actorVersionModifier = { tarballUrl, sourceFiles, buildTag, sourceType, envVars };
            // TODO: fix this type too -.-
            await actorClient.version(version).update(actorVersionModifier as never);
            run(`Updated version ${version} for Actor ${actor.name}.`);
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
                ...actorNewVersion,
            } as never);

            run(`Created version ${version} for Actor ${actor.name}.`);
        }

        // Build actor on Apify and wait for build to finish
        run(`Building Actor ${actor.name}`);
        let build = await actorClient.build(version, {
            useCache: true,
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        });

        try {
            await outputJobLog(build, waitForFinishMillis);
        } catch (err) {
            warning('Can not get log:');
            console.error(err);
        }

        build = (await apifyClient.build(build.id).get())!;

        link('Actor build detail', `https://console.apify.com${redirectUrlPart}/actors/${build.actId}#/builds/${build.buildNumber}`);

        // Disable open browser on CI, or if user passed --no-prompt flag
        if (!isCI && !this.flags.noPrompt) {
            const shouldOpenBrowser = await inquirer.prompt([
                { type: 'confirm', name: 'continue', message: 'Do you want to open the Actor detail in your browser?', default: true },
            ]);

            if (shouldOpenBrowser.continue) {
                await open(`https://console.apify.com${redirectUrlPart}/actors/${build.actId}`);
            }
        }

        if (build.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
            success('Actor was deployed to Apify cloud and built there.');
            // @ts-expect-error FIX THESE TYPES 😢
        } else if (build.status === ACTOR_JOB_STATUSES.READY) {
            warning('Build is waiting for allocation.');
            // @ts-expect-error FIX THESE TYPES 😢
        } else if (build.status === ACTOR_JOB_STATUSES.RUNNING) {
            warning('Build is still running.');
            // @ts-expect-error FIX THESE TYPES 😢
        } else if (build.status === ACTOR_JOB_STATUSES.ABORTED || build.status === ACTOR_JOB_STATUSES.ABORTING) {
            warning('Build was aborted!');
            // @ts-expect-error FIX THESE TYPES 😢
        } else if (build.status === ACTOR_JOB_STATUSES.TIMED_OUT || build.status === ACTOR_JOB_STATUSES.TIMING_OUT) {
            warning('Build timed out!');
        } else {
            error('Build failed!');
        }
    }
}
