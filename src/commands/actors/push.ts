import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import type { Actor, ActorCollectionCreateOptions, ActorDefaultRunOptions } from 'apify-client';
import open from 'open';

import { fetchManifest } from '@apify/actor-templates';
import {
	ACTOR_JOB_STATUSES,
	ACTOR_JOB_TERMINAL_STATUSES,
	ACTOR_SOURCE_TYPES,
	MAX_MULTIFILE_BYTES,
} from '@apify/consts';
import { createHmacSignature } from '@apify/utilities';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { getConsoleUrl } from '../../lib/console-url.js';
import { CommandExitCodes, DEPRECATED_LOCAL_CONFIG_NAME, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { sumFilesSizeInBytes } from '../../lib/files.js';
import { useAbortJobOnSignal } from '../../lib/hooks/useAbortJobOnSignal.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, info, run, simpleLog, warning } from '../../lib/outputs.js';
import { transformEnvToEnvVars } from '../../lib/secrets.js';
import {
	createActZip,
	createSourceFiles,
	getActorLocalFilePaths,
	getLocalUserInfo,
	getLoggedClientOrThrow,
	outputJobLog,
	parseWaitForFinishMillis,
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

// How many trailing log lines to surface as the failure reason.
const BUILD_LOG_TAIL_LINES = 10;

// TODO: switch to `type` once the `consistent-type-definitions` lint rule is
// aligned with the Apify Coding Standards (tracked in
// https://github.com/apify/apify-cli/issues/1211).
interface PushResult {
	ok: boolean;
	operation: 'push';
	actor: { id: string; url: string };
	build: { id: string; number: string; status: string; url: string };
	error?: { phase: 'build'; message: string; logTail: string[] };
	exitCode?: number;
}

interface PushOutcome {
	resultLabel: string;
	exitCode?: number;
	ok: boolean;
	errorMessage?: string;
}

// Maps the final build status to the overall push outcome. A still-running
// fire-and-forget build is not a failure (`ok: true`) — its pending state is
// conveyed by the build status, and it carries no exit code yet.
export function resolvePushOutcome(buildStatus: string): PushOutcome {
	switch (buildStatus) {
		case ACTOR_JOB_STATUSES.SUCCEEDED:
			return { resultLabel: 'SUCCEEDED', exitCode: 0, ok: true };
		case ACTOR_JOB_STATUSES.READY:
			return { resultLabel: 'PENDING', ok: true };
		case ACTOR_JOB_STATUSES.RUNNING:
			return { resultLabel: 'RUNNING', ok: true };
		case ACTOR_JOB_STATUSES.ABORTING:
			return {
				resultLabel: 'ABORTING',
				exitCode: CommandExitCodes.BuildAborted,
				ok: false,
				errorMessage: 'Build is aborting',
			};
		case ACTOR_JOB_STATUSES.ABORTED:
			return {
				resultLabel: 'ABORTED',
				exitCode: CommandExitCodes.BuildAborted,
				ok: false,
				errorMessage: 'Build aborted',
			};
		case ACTOR_JOB_STATUSES.TIMING_OUT:
			return {
				resultLabel: 'TIMING_OUT',
				exitCode: CommandExitCodes.BuildTimedOut,
				ok: false,
				errorMessage: 'Build is timing out',
			};
		case ACTOR_JOB_STATUSES.TIMED_OUT:
			return {
				resultLabel: 'TIMED_OUT',
				exitCode: CommandExitCodes.BuildTimedOut,
				ok: false,
				errorMessage: 'Build timed out',
			};
		case ACTOR_JOB_STATUSES.FAILED:
			return { resultLabel: 'FAILED', exitCode: CommandExitCodes.BuildFailed, ok: false, errorMessage: 'Build failed' };
		default:
			return {
				resultLabel: 'UNKNOWN',
				exitCode: CommandExitCodes.BuildFailed,
				ok: false,
				errorMessage: `Build finished with unexpected status "${buildStatus}"`,
			};
	}
}

// Best-effort pre-upload check for a common TypeScript packaging trap: a
// single-stage Dockerfile that runs `npm install --omit=dev` (or
// `--production`) and a package.json build script that shells out to `tsc`,
// while `typescript` sits in devDependencies. The platform-side Docker build
// will fail because tsc is dropped before `npm run build` runs. This is a
// warning only — the source of truth is the platform build.
export function detectOmitDevTscTrap(cwd: string): string | null {
	const dockerfileCandidates = [join(cwd, '.actor', 'Dockerfile'), join(cwd, 'Dockerfile')];
	let dockerfileContent: string | null = null;
	for (const candidate of dockerfileCandidates) {
		if (existsSync(candidate)) {
			try {
				dockerfileContent = readFileSync(candidate, 'utf8');
				break;
			} catch {
				// unreadable — ignore, this check is best-effort
			}
		}
	}
	if (!dockerfileContent) return null;

	// Match `npm ci|install|i` followed anywhere on the same command by
	// `--omit=dev` or `--production` (with optional `=true`). Line-based to
	// avoid crossing RUN boundaries. Backslash continuations are handled by
	// checking each logical `\` -joined chunk.
	const commandChunks = dockerfileContent
		.replace(/\\\n/g, ' ') // fold backslash-continuations onto one line
		.split('\n');
	const dropsDevDeps = commandChunks.some(
		(line) => /\bnpm\s+(ci|install|i)\b/.test(line) && /(--omit[= ]dev|--production(?:[= ]true)?)/.test(line),
	);
	if (!dropsDevDeps) return null;

	// package.json lookup
	const packageJsonPath = join(cwd, 'package.json');
	if (!existsSync(packageJsonPath)) return null;
	let pkg: {
		scripts?: Record<string, string>;
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	try {
		pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	} catch {
		// malformed package.json — not our problem to diagnose here
		return null;
	}

	const buildScript = pkg.scripts?.build ?? '';
	// Match a standalone `tsc` invocation (not `tsc-alias`, `tsconfig`, etc.).
	const buildUsesTsc = /(^|[\s&|;])tsc($|[\s&|;])/.test(buildScript);
	if (!buildUsesTsc) return null;

	const tsInDev = !!pkg.devDependencies?.typescript;
	const tsInProd = !!pkg.dependencies?.typescript;
	if (!tsInDev || tsInProd) return null;

	return [
		'npm --omit=dev drops typescript (in devDependencies); the build stage needs tsc.',
		'Either (a) use a multi-stage Dockerfile where the build stage installs devDeps then',
		'copies dist/ to the runtime stage, or (b) drop --omit=dev.',
	].join('\n  ');
}

export class ActorsPushCommand extends ApifyCommand<typeof ActorsPushCommand> {
	static override name = 'push' as const;

	static override description =
		`Deploys Actor to Apify platform using settings from '${LOCAL_CONFIG_PATH}'.\n` +
		`Files under '${MAX_MULTIFILE_BYTES / 1024 ** 2}' MB upload as "Multiple source files"; ` +
		`larger projects upload as ZIP file.\n` +
		`Files matched by .gitignore and .actorignore are excluded. ` +
		`Use negation patterns (e.g. !dist/) in .actorignore to force-include git-ignored files.\n` +
		`Use --force to override newer remote versions.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Deploy the current Actor to the Apify platform.',
			command: 'apify push',
		},
		{
			description: 'Deploy to a specific Actor by ID, overriding newer remote versions.',
			command: 'apify push E2jjCZBezvAZnX8Rb --force',
		},
		{
			description: 'Deploy without waiting for the build to finish.',
			command: 'apify push --no-wait-for-finish',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-push';

	static override enableJsonFlag = true;

	static override flags = {
		version: Flags.string({
			char: 'v',
			description: `Actor version number to which the files should be pushed. By default, it is taken from the '${LOCAL_CONFIG_PATH}' file.`,
			required: false,
		}),
		'build-tag': Flags.string({
			char: 'b',
			description: `Build tag to be applied to the successful Actor build. By default, it is taken from the '${LOCAL_CONFIG_PATH}' file.`,
			required: false,
		}),
		'wait-for-finish': Flags.string({
			char: 'w',
			description:
				'In seconds, how long to wait for the build to finish. If no value passed, it waits forever. To return as soon as the build is queued (fire-and-forget), pass 0. The exit code reflects the build outcome only — if the wait elapses with the build still running, the command exits 0; check status via the printed link or --json output.',
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
			description: 'Directory where the Actor is located.',
			required: false,
		}),
		'allow-missing-secrets': Flags.boolean({
			description: 'Allow the command to continue even when secret values are not found in the local secrets storage.',
			required: false,
			default: false,
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
		const version = this.flags.version || (actorConfig?.version as string | undefined) || DEFAULT_ACTOR_VERSION_NUMBER;

		let buildTag = this.flags.buildTag || (actorConfig?.buildTag as string | undefined);

		// We can't add the default build tag to everything. If a user creates a new
		// version, e.g. for testing, but forgets to add a tag, it would use the default
		// tag and their production runs might be affected ❌
		// TODO: revisit this when we have better build tagging system on platform.
		if (!buildTag && version === DEFAULT_ACTOR_VERSION_NUMBER) {
			buildTag = DEFAULT_BUILD_TAG;
		}

		const waitForFinishMillis = parseWaitForFinishMillis(this.flags.waitForFinish);

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
				const defaultRunOptions = (actorTemplate?.defaultRunOptions || DEFAULT_RUN_OPTIONS) as ActorDefaultRunOptions;
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

		this.telemetryData.push = {
			actorId,
			wasCreated: isActorCreatedNow,
		};

		const actorClient = apifyClient.actor(actorId);

		info({ message: `Deploying Actor '${actorConfig!.name}' to Apify.` });

		// Best-effort local sanity check: warn (never block) if the Dockerfile
		// drops devDependencies before running a tsc-based build script. See
		// detectOmitDevTscTrap for the full heuristic.
		const trapWarning = detectOmitDevTscTrap(cwd);
		if (trapWarning) {
			warning({ message: trapWarning });
		}

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
			? transformEnvToEnvVars(actorConfig!.environmentVariables as Record<string, string>, undefined, {
					allowMissing: this.flags.allowMissingSecrets,
				})
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
		// Anchor the deadline at build start so log streaming + status polling
		// share one budget. Without this, a log stream that dies near the cap
		// would let the poll loop wait another full --wait-for-finish on top.
		const deadline = waitForFinishMillis === undefined ? Infinity : Date.now() + waitForFinishMillis;
		let build = await actorClient.build(version, {
			useCache: true,
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		});

		// Forward interrupt signals (Ctrl+C, SIGTERM, SIGHUP) to a platform-side
		// abort for the lifetime of log streaming AND status polling, so the
		// build doesn't keep running after the user gives up waiting.
		using _signalHandler = useAbortJobOnSignal({
			apifyClient,
			kind: 'build',
			jobId: build.id,
		});

		try {
			const logBudgetMs = Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : undefined;
			await outputJobLog({ job: build, timeoutMillis: logBudgetMs, apifyClient });
		} catch (err) {
			warning({ message: 'Can not get log:' });
			console.error(err);
		}

		const refreshedBuild = await apifyClient.build(build.id).get();
		if (!refreshedBuild) {
			error({ message: `Could not fetch build with ID "${build.id}" after deployment.` });
			process.exitCode = CommandExitCodes.BuildFailed;
			return;
		}
		build = refreshedBuild;

		// `outputJobLog` can return before the build is actually terminal (stream
		// ended early, timeout hit). Poll the remaining budget so the status
		// branches below see the real outcome.
		while (!ACTOR_JOB_TERMINAL_STATUSES.includes(build.status as never) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			build = (await apifyClient.build(build.id).get())!;
		}

		// Platform updates `taggedBuilds[buildTag]` asynchronously after the
		// build finishes. Wait until the tag points at this build so callers
		// (including --json automation) that immediately
		// `actor.start({ build: buildTag })` don't race it. Skipped when
		// --wait-for-finish=0 (fire-and-forget).
		if (build.status === ACTOR_JOB_STATUSES.SUCCEEDED && buildTag && waitForFinishMillis !== 0) {
			run({ message: `Applying build tag "${buildTag}"...` });
			const tagDeadline = Date.now() + 5_000;
			let tagApplied = false;
			while (Date.now() < tagDeadline) {
				const a = await actorClient.get();
				if (a?.taggedBuilds?.[buildTag]?.buildId === build.id) {
					tagApplied = true;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			if (!tagApplied) {
				warning({
					message: `Build succeeded but tag "${buildTag}" was not set after 5 seconds; subsequent calls referencing this tag may not find it.`,
				});
			}
		}

		const buildStatus = build.status as string;
		const outcome = resolvePushOutcome(buildStatus);

		const actorUrl = `${getConsoleUrl()}${redirectUrlPart}/actors/${build.actId}`;
		const buildUrl = `${actorUrl}#/builds/${build.buildNumber}`;

		// Surface the tail of the build log as the failure reason. Best-effort:
		// the build status already conveys the outcome if the log can't be read.
		let logTail: string[] = [];
		if (outcome.errorMessage) {
			try {
				const log = await apifyClient.log(build.id).get();
				if (log) {
					logTail = log
						.split('\n')
						.map((line) => line.trimEnd())
						.filter((line) => line.length > 0)
						.slice(-BUILD_LOG_TAIL_LINES);
				}
			} catch {
				// ignore — reason block is optional
			}
		}

		if (outcome.exitCode) {
			process.exitCode = outcome.exitCode;
		}

		const result: PushResult = {
			ok: outcome.ok,
			operation: 'push',
			actor: { id: build.actId, url: actorUrl },
			build: { id: build.id, number: build.buildNumber, status: buildStatus, url: buildUrl },
		};
		if (outcome.exitCode !== undefined) {
			result.exitCode = outcome.exitCode;
		}
		if (outcome.errorMessage) {
			result.error = { phase: 'build', message: outcome.errorMessage, logTail };
		}

		if (this.flags.json) {
			printJsonToStdout(result);
			return;
		}

		const lines = [
			`Apify push result: ${outcome.resultLabel}`,
			'',
			'Upload: SUCCEEDED',
			`Build: ${buildStatus}`,
			`Actor ID: ${build.actId}`,
			`Build ID: ${build.id}`,
			`Build number: ${build.buildNumber}`,
			...(outcome.exitCode ? [`Exit code: ${outcome.exitCode}`] : []),
			'',
			`Actor URL: ${actorUrl}`,
			`Build URL: ${buildUrl}`,
			...(outcome.errorMessage && logTail.length ? ['', 'Reason:', ...logTail] : []),
		];
		simpleLog({ stdout: true, message: lines.join('\n') });

		if (this.flags.open) {
			await open(actorUrl);
		}
	}
}
