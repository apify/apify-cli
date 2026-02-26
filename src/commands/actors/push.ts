import { readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import type { Actor, ActorCollectionCreateOptions, ActorDefaultRunOptions } from 'apify-client';
import open from 'open';

import { fetchManifest } from '@apify/actor-templates';
import { ACTOR_JOB_STATUSES, ACTOR_SOURCE_TYPES, MAX_MULTIFILE_BYTES } from '@apify/consts';
import { createHmacSignature } from '@apify/utilities';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes, DEPRECATED_LOCAL_CONFIG_NAME, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { sumFilesSizeInBytes } from '../../lib/files.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, info, link, run, success, warning } from '../../lib/outputs.js';
import { transformEnvToEnvVars } from '../../lib/secrets.js';
import {
	createActZip,
	createSourceFiles,
	getActorLocalFilePaths,
	getLocalUserInfo,
	getLoggedClientOrThrow,
	outputJobLog,
	printJsonToStdout,
} from '../../lib/utils.js';

const TEMP_ZIP_FILE_NAME = 'temp_file.zip';
const DEFAULT_RUN_OPTIONS = {
	build: 'latest',
	memoryMbytes: 4096,
	timeoutSecs: 3600,
};
const DEFAULT_ACTOR_VERSION_NUMBER = '0.0';

// It would be better to use `version-0.0` or similar,
// or even have no default tag, but the platform complains when
// Actor does not have a build with a `latest` tag, so until
// that changes, we have to add it.
const DEFAULT_BUILD_TAG = 'latest';

export class ActorsPushCommand extends ApifyCommand<typeof ActorsPushCommand> {
	static override name = 'push' as const;

	static override description =
		`Deploys Actor to Apify platform using settings from '${LOCAL_CONFIG_PATH}'.\n` +
		`Files under '${MAX_MULTIFILE_BYTES / 1024 ** 2}' MB upload as "Multiple source files"; ` +
		`larger projects upload as ZIP file.\n` +
		`Use --force to override newer remote versions.`;

	static override enableJsonFlag = true;

	static override flags = {
		version: Flags.string({
			char: 'v',
			description: `Actor version number to which the files should be pushed. By default, it is taken from the '${LOCAL_CONFIG_PATH}' file.`,
			required: false,
		}),
		'build-tag': Flags.string({
			char: 'b',
			description: `Build tag to be applied to the successful Actor build. By default, it is taken from the '${LOCAL_CONFIG_PATH}' file`,
			required: false,
		}),
		'wait-for-finish': Flags.string({
			char: 'w',
			description: 'Seconds for waiting to build to finish, if no value passed, it waits forever.',
			required: false,
		}),
		'open': Flags.boolean({
			description: 'Whether to open the browser automatically to the Actor details page.',
			default: false,
			required: false,
		}),
		force: Flags.boolean({
			char: 'f',
			description: 'Push an Actor even when the local files are older than the Actor on the platform.',
			default: false,
			required: false,
		}),
		dir: Flags.string({
			description: 'Directory where the Actor is located',
			required: false,
		}),
	};

	static override args = {
		actorId: Args.string({
			required: false,
			description:
				'Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). ' +
				`If not provided, the command will create or modify the Actor with the name specified in '${LOCAL_CONFIG_PATH}' file.`,
		}),
	};

	async run() {
		// Resolving with `.` will mean stay in the cwd folder, whereas anything else in dir will be resolved. If users pass in a full path (`/home/...`, it will correctly resolve to that)
		const cwd = resolve(process.cwd(), this.flags.dir ?? '.');

		// Validate there are files before rest of the logic
		const filePathsToPush = await getActorLocalFilePaths(cwd);

		if (!filePathsToPush.length) {
			error({ message: 'You need to call this command from a folder that has an Actor in it!' });
			process.exitCode = CommandExitCodes.NoFilesToPush;
			return;
		}

		if (
			// Check that some of these files exist, cuz otherwise we cannot do much
			![
				// old apify project
				DEPRECATED_LOCAL_CONFIG_NAME,
				// new apify project
				'actor.json',
				'.actor/actor.json',
				// The .actor folder existing in general
				'.actor',
			].some((filePath) => filePathsToPush.some((fp) => fp === filePath || fp.startsWith(filePath)))
		) {
			error({
				message: [
					'A valid Actor could not be found in the current directory. Please make sure you are in the correct directory.',
					'You can also turn this directory into an Actor by running `apify init`.',
				].join('\n'),
			});

			process.exitCode = CommandExitCodes.NoFilesToPush;
			return;
		}

		const apifyClient = await getLoggedClientOrThrow();

		const actorConfigResult = await useActorConfig({ cwd });

		if (actorConfigResult.isErr()) {
			error({ message: actorConfigResult.unwrapErr().message });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config: actorConfig } = actorConfigResult.unwrap();

		const userInfo = await getLocalUserInfo();
		const isOrganizationLoggedIn = !!userInfo.organizationOwnerUserId;
		const redirectUrlPart = isOrganizationLoggedIn ? `/organization/${userInfo.id}` : '';

		let actorId: string;
		let actor: Actor;
		let isActorCreatedNow = false;

		// User can override Actor version and build tag, attributes in localConfig will remain same.
		const version =
			this.flags.version || (actorConfig?.version as string | undefined) || DEFAULT_ACTOR_VERSION_NUMBER;

		let buildTag = this.flags.buildTag || (actorConfig?.buildTag as string | undefined);

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

		// User can override actorId of pushing Actor.
		// It causes that we push Actor to this id but attributes in localConfig will remain same.
		const forceActorId = this.args.actorId;

		if (forceActorId) {
			actor = (await apifyClient.actor(forceActorId).get())!;
			if (!actor) throw new Error(`Cannot find Actor with ID '${forceActorId}' in your account.`);
			actorId = actor.id;
		} else {
			const usernameOrId = userInfo.username || userInfo.id;
			actor = (await apifyClient.actor(`${usernameOrId}/${actorConfig!.name}`).get())!;
			if (actor) {
				actorId = actor.id;
			} else {
				const { templates } = await fetchManifest();
				const actorTemplate = templates.find((t) => t.name === actorConfig!.template);
				const defaultRunOptions = (actorTemplate?.defaultRunOptions ||
					DEFAULT_RUN_OPTIONS) as ActorDefaultRunOptions;
				const newActor: ActorCollectionCreateOptions = {
					name: actorConfig!.name as string,
					title: actorConfig!.title as string | undefined,
					description: actorConfig!.description as string | undefined,
					defaultRunOptions,
					versions: [
						{
							versionNumber: version,
							buildTag,
							// TODO: export enum from apify-client
							sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES as never,
							sourceFiles: [],
						},
					],
				};

				// Enable standby mode if configured in actor.json
				if (actorConfig!.usesStandbyMode) {
					newActor.actorStandby = { isEnabled: true };
				}

				actor = await apifyClient.actors().create(newActor);
				actorId = actor.id;
				isActorCreatedNow = true;
				info({ message: `Created Actor with name ${actorConfig!.name} on Apify.` });
			}
		}

		const actorClient = apifyClient.actor(actorId);

		info({ message: `Deploying Actor '${actorConfig!.name}' to Apify.` });

		const filesSize = await sumFilesSizeInBytes(filePathsToPush, cwd);

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

				if (
					!this.flags.force &&
					actorModifiedMs &&
					mostRecentModifiedFileMs < actorModifiedMs &&
					(actorConfig?.name || forceActorId)
				) {
					throw new Error(
						`Actor with identifier "${actorConfig?.name || forceActorId}" is already on the platform and was modified there since modified locally.
Skipping push. Use --force to override.`,
					);
				}
			}

			sourceFiles = await createSourceFiles(filePathsToPush, cwd);
			sourceType = ACTOR_SOURCE_TYPES.SOURCE_FILES;
		} else {
			// Create zip
			run({ message: 'Zipping Actor files' });
			await createActZip(TEMP_ZIP_FILE_NAME, filePathsToPush, cwd);

			// Upload it to Apify.keyValueStores
			const store = await apifyClient.keyValueStores().getOrCreate(`actor-${actorId}-source`);
			const key = `version-${version}.zip`;
			const buffer = readFileSync(TEMP_ZIP_FILE_NAME);
			await apifyClient.keyValueStore(store.id).setRecord({
				key,
				// TODO: fix this type too
				value: buffer as never,
				contentType: 'application/zip',
			});
			unlinkSync(TEMP_ZIP_FILE_NAME);
			const tempTarballUrl = new URL(
				`${apifyClient.baseUrl}/key-value-stores/${store.id}/records/${key}?disableRedirect=true`,
			);

			/**
			 * Signs the tarball URL to grant temporary access for restricted resources.
			 * When a store is set to 'RESTRICTED', direct URLs are disabled. Instead of
			 * appending a security token, we add a signature to the URL parameters.
			 * https://github.com/apify/apify-core/issues/22197
			 *
			 * TODO: Use keyValueStore(:storeId).getRecordPublicUrl from apify-client instead once it is released.
			 */
			if (store?.urlSigningSecretKey) {
				const signature = createHmacSignature(store.urlSigningSecretKey, key);
				tempTarballUrl.searchParams.set('signature', signature);
			}

			tarballUrl = tempTarballUrl.toString();
			sourceType = ACTOR_SOURCE_TYPES.TARBALL;
		}

		// Update Actor version
		const actorCurrentVersion = await actorClient.version(version).get();
		const envVars = actorConfig!.environmentVariables
			? transformEnvToEnvVars(actorConfig!.environmentVariables as Record<string, string>)
			: undefined;

		if (actorCurrentVersion) {
			const actorVersionModifier = { tarballUrl, sourceFiles, buildTag, sourceType, envVars };
			// TODO: fix this type too -.-
			await actorClient.version(version).update(actorVersionModifier as never);
			run({ message: `Updated version ${version} for Actor ${actor.name}.` });
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

			run({ message: `Created version ${version} for Actor ${actor.name}.` });
		}

		// Sync standby mode on existing actors with actor.json
		if (!isActorCreatedNow && !!actorConfig!.usesStandbyMode !== !!actor.actorStandby?.isEnabled) {
			const isEnabled = !!actorConfig!.usesStandbyMode;
			await actorClient.update({ actorStandby: { isEnabled } });
			info({ message: `${isEnabled ? 'Enabled' : 'Disabled'} standby mode for Actor ${actor.name}.` });
		}

		// Build Actor on Apify and wait for build to finish
		run({ message: `Building Actor ${actor.name}` });
		let build = await actorClient.build(version, {
			useCache: true,
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		});

		try {
			await outputJobLog({ job: build, timeoutMillis: waitForFinishMillis, apifyClient });
		} catch (err) {
			warning({ message: 'Can not get log:' });
			console.error(err);
		}

		build = (await apifyClient.build(build.id).get())!;

		if (this.flags.json) {
			printJsonToStdout(build);
			return;
		}

		link({
			message: 'Actor build detail',
			url: `https://console.apify.com${redirectUrlPart}/actors/${build.actId}#/builds/${build.buildNumber}`,
		});

		link({
			message: 'Actor detail',
			url: `https://console.apify.com${redirectUrlPart}/actors/${build.actId}`,
		});

		if (this.flags.open) {
			await open(`https://console.apify.com${redirectUrlPart}/actors/${build.actId}`);
		}

		if (build.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
			success({ message: 'Actor was deployed to Apify cloud and built there.' });
			// @ts-expect-error FIX THESE TYPES 😢
		} else if (build.status === ACTOR_JOB_STATUSES.READY) {
			warning({ message: 'Build is waiting for allocation.' });
			// @ts-expect-error FIX THESE TYPES 😢
		} else if (build.status === ACTOR_JOB_STATUSES.RUNNING) {
			warning({ message: 'Build is still running.' });
			// @ts-expect-error FIX THESE TYPES 😢
		} else if (build.status === ACTOR_JOB_STATUSES.ABORTED || build.status === ACTOR_JOB_STATUSES.ABORTING) {
			warning({ message: 'Build was aborted!' });
			process.exitCode = CommandExitCodes.BuildAborted;
			// @ts-expect-error FIX THESE TYPES 😢
		} else if (build.status === ACTOR_JOB_STATUSES.TIMED_OUT || build.status === ACTOR_JOB_STATUSES.TIMING_OUT) {
			warning({ message: 'Build timed out!' });
			process.exitCode = CommandExitCodes.BuildTimedOut;
		} else {
			error({ message: 'Build failed!' });
			process.exitCode = CommandExitCodes.BuildFailed;
		}
	}
}
