import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, rmSync, type Stats, statSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

import type { Actor, ActorCollectionCreateOptions, ActorDefaultRunOptions, Build } from 'apify-client';
import chalk from 'chalk';
import { isCI } from 'ci-info';
import open from 'open';

import { fetchManifest } from '@apify/actor-templates';
import { ACTOR_JOB_STATUSES, ACTOR_JOB_TYPES, ACTOR_SOURCE_TYPES, MAX_MULTIFILE_BYTES } from '@apify/consts';
import { createHmacSignature } from '@apify/utilities';

import { checkActorPaths, formatActorPathProblems } from '../../lib/actor-paths.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { isTerminalStatus } from '../../lib/commands/agent-output.js';
import { getConsoleUrl } from '../../lib/console-url.js';
import {
	CommandExitCodes,
	DEPRECATED_LOCAL_CONFIG_NAME,
	INTERRUPT_SIGNALS,
	LOCAL_CONFIG_PATH,
} from '../../lib/consts.js';
import {
	getContextFilePaths,
	isOutside,
	readGitState,
	realPath,
	resolveDockerContext,
	toPosix,
} from '../../lib/docker-context.js';
import { sumFilesSizeInBytes } from '../../lib/files.js';
import { findActorDirs, type FoundActorDir, toPosixRelative } from '../../lib/find-actor-dirs.js';
import { isAbortingJobOnSignal, useAbortJobOnSignal } from '../../lib/hooks/useAbortJobOnSignal.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { useMultiSelectFromList } from '../../lib/hooks/user-confirmations/useMultiSelectFromList.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { reraiseSignal, useSignalHandler } from '../../lib/hooks/useSignalHandler.js';
import { useStdin } from '../../lib/hooks/useStdin.js';
import { error, info, run, simpleLog, warning } from '../../lib/outputs.js';
import { transformEnvToEnvVars } from '../../lib/secrets.js';
import {
	createActZip,
	createSourceFiles,
	getActorLocalFilePaths,
	getCurrentUserInfo,
	getLoggedClientOrThrow,
	outputJobLog,
	parseWaitForFinishMillis,
	printJsonToStdout,
} from '../../lib/utils.js';

const DEFAULT_RUN_OPTIONS = {
	build: 'latest',
	memoryMbytes: 4096,
	timeoutSecs: 3600,
};
const DEFAULT_ACTOR_VERSION_NUMBER = '0.0';
/** The longest name of a multi-file source file the platform accepts. */
const MAX_SOURCE_FILE_NAME_LENGTH = 255;

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

/**
 * One entry of a push from a root without an Actor of its own: the single push result, or what stopped it.
 * `skipped` marks an Actor left alone on purpose (a declined Git-source switch); it carries no exit code.
 */
interface SelectedPushResult extends Partial<PushResult> {
	dir: string;
	ok: boolean;
	skipped?: true;
}

interface PushSelectionResult {
	ok: boolean;
	operation: 'push';
	results: SelectedPushResult[];
	exitCode?: number;
}

const SELECTION_HINT = 'Choose what to push: --all, or run apify push --dir <path> for each Actor.';

/** Marks an Actor in a directory .gitignore ignores. --all skips it; picking it or naming it with --dir pushes it. */
const IGNORED_TAG = '[ignored by .gitignore]';

/** Quotes a path a shell would split or expand, so a printed command still works when copied. */
const quoteForShell = (path: string) => (/^[\w./-]+$/.test(path) ? path : `"${path}"`);

const interruptedMessage = (notPushed: string[]) => `Interrupted. Not pushed: ${notPushed.join(', ')}`;

/**
 * Says which Actors a signal left out, right before that signal ends the process. The writes are synchronous because
 * output still queued when the process ends is lost; a failed write must not keep the process alive.
 */
function reportInterruptBeforeExit(notPushed: string[], summary: PushSelectionResult | undefined) {
	try {
		writeSync(2, `${chalk.yellow.bold('Warning:')} ${interruptedMessage(notPushed)}\n`);

		if (summary) {
			writeSync(1, `${JSON.stringify(summary, null, 2)}\n`);
		}
	} catch {
		// The process ends either way.
	}
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

/**
 * Asks before `apify push` turns a Git-sourced version into source files, which drops the Git connection.
 * `--force` skips the question but keeps the warning. Without a terminal and without it, the run stops here.
 */
const confirmGitSourceSwitch = async ({
	actorName,
	gitRepoUrl,
	force,
}: {
	actorName: string;
	gitRepoUrl: string;
	force: boolean;
}) => {
	warning({
		message: [
			`Actor ${actorName} builds from a Git repository: ${gitRepoUrl}`,
			'A push replaces that source with the local files and drops the Git connection.',
			'To build from the repository, run git push instead. The platform builds on push when automated builds are on.',
		].join('\n'),
	});

	if (force) return true;

	return useYesNoConfirm({
		message: 'Switch the source to the local files?',
		default: false,
		errorMessageForStdin: `Actor ${actorName} builds from a Git repository. To switch the source to the local files, use --force.`,
	});
};

/**
 * Push sends files only, in the multi-file and the zip upload alike: a link to a file the upload holds goes as that
 * file at the link's path, a link to a directory inside the upload as copies of the uploaded files under its target
 * (directory links there included), and a link to nothing, to a file the upload leaves out (such as a gitignored
 * .env), or to a target outside the upload is left out, as a clone of the repository could not follow it either. A
 * link to a file that only the Actor folder's upload adds, such as a gitignored dist that its .actorignore takes back,
 * goes too, and so does a directory link to such files. The `actor.json` path check then reports a config that refers
 * to a left-out link as not uploaded.
 */
const resolveLinksForUpload = (root: string, files: string[], actorPath: string, actorFolderFiles: string[]) => {
	const realRoot = realpathSync(root);
	// Git lists names composed (NFC) on macOS, while a link's target keeps the form its text has.
	const listed = new Set(files.map((file) => file.normalize('NFC')));
	// The Actor folder's files have their names as stored on disk, as a target's native real path spells them.
	const actorFolderUpload = new Set(actorFolderFiles);
	// Outside Git, the file list follows folder links, so a file that is no link itself can lie outside the upload too.
	// Its folder's real path tells, once per folder.
	const folders = new Map<string, boolean>();
	const isFolderInUpload = (folder: string) => {
		let inUpload = folders.get(folder);
		if (inUpload === undefined) {
			try {
				inUpload = !isOutside(relative(realRoot, realpathSync(join(root, folder))));
			} catch {
				inUpload = false;
			}
			folders.set(folder, inUpload);
		}
		return inUpload;
	};
	// Where an entry's content lies, relative to the root, as the link spells it and as stored on disk, and what it is;
	// nothing for a link the upload drops.
	interface Located {
		target: string;
		diskTarget: string;
		stats: Stats;
	}
	const locate = (file: string): Located | undefined => {
		const filePath = join(root, file);
		const stats = lstatSync(filePath, { throwIfNoEntry: false });
		if (!stats) return undefined;
		if (!stats.isSymbolicLink()) {
			return isFolderInUpload(dirname(file)) ? { target: file, diskTarget: file, stats } : undefined;
		}
		try {
			const realFilePath = realpathSync(filePath);
			const target = relative(realRoot, realFilePath);
			if (isOutside(target)) return undefined;
			const targetStats = statSync(realFilePath);
			const diskTarget = toPosix(relative(realRoot, realPath(filePath)));
			if (targetStats.isFile() && !listed.has(toPosix(target).normalize('NFC')) && !actorFolderUpload.has(diskTarget)) {
				return undefined;
			}
			return { target: toPosix(target), diskTarget, stats: targetStats };
		} catch {
			return undefined;
		}
	};
	const located = new Map(files.map((file) => [file, locate(file)]));
	// Git may spell the Actor folder otherwise than the disk stores it: composed (NFC) on macOS, or in its old case after
	// a case-only rename. Its spelling in Git's list is confirmed on disk, as that of another folder can match too.
	const fold = (name: string) => name.normalize('NFC').toLowerCase();
	const actorDepth = actorPath.split('/').length;
	const gitActorPath =
		[
			...new Set(
				files
					.filter((file) => fold(file).startsWith(fold(`${actorPath}/`)))
					.map((file) => file.split('/').slice(0, actorDepth).join('/')),
			),
		].find((folder) => {
			try {
				return realPath(join(root, folder)) === join(realRoot, actorPath);
			} catch {
				return false;
			}
		}) ?? actorPath;
	// The Actor folder's upload adds files a clone lacks, such as its gitignored dist, which a directory link copies too.
	// A file Git lists in another spelling is no such file, which the disk confirms, as on a case-sensitive file system
	// names that differ in case only are two files. Each maps to its name with the Actor folder as Git spells it.
	const listedByFold = new Map(files.map((file) => [fold(file), file]));
	const isListed = (file: string) => {
		if (listed.has(file.normalize('NFC'))) return true;
		const spelling = listedByFold.get(fold(file));
		if (spelling === undefined) return false;
		try {
			return realPath(join(root, spelling)) === realPath(join(root, file));
		} catch {
			return false;
		}
	};
	const actorFolderOnly = new Map(
		actorFolderFiles
			.filter((file) => !isListed(file))
			.map((file) => [file, `${gitActorPath}${file.slice(actorPath.length)}`]),
	);
	for (const file of actorFolderOnly.keys()) {
		let entry: Located | undefined;
		try {
			const realFilePath = realPath(join(root, file));
			const stats = statSync(realFilePath);
			if (stats.isFile() && !isOutside(relative(realRoot, realFilePath)))
				entry = { target: file, diskTarget: file, stats };
		} catch {
			// A file that vanished since it was listed goes nowhere.
		}
		located.set(file, entry);
	}
	const uploaded = [...files, ...actorFolderOnly.keys()];
	// A directory link copies the files under its target, and through a directory link there, the files under that
	// one's target, as a clone resolves them; a link back to a target on the way copies nothing, which ends a cycle.
	// The Actor folder's own files match the target as Git spells the Actor folder, so their copies sit beside those of
	// its listed files, else as the disk stores it.
	const expand = (file: string, targets: string[]): string[] => {
		const entry = located.get(file);
		if (!entry) return [];
		if (entry.stats.isFile()) return [file];
		if (!entry.stats.isDirectory() || targets.includes(entry.target)) return [];
		return uploaded.flatMap((other) => {
			const gitSpelling = actorFolderOnly.get(other);
			const [name, prefix] =
				gitSpelling === undefined || gitSpelling.startsWith(`${entry.target}/`)
					? [gitSpelling ?? other, `${entry.target}/`]
					: [other, `${entry.diskTarget}/`];
			if (!name.startsWith(prefix)) return [];
			const copyPath = `${file}/${name.slice(prefix.length)}`;
			return expand(other, [...targets, entry.target]).map((copy) => `${copyPath}${copy.slice(other.length)}`);
		});
	};
	return files.flatMap((file) => expand(file, []));
};

/**
 * The Actor folder goes as an ordinary push of it would send it: its .gitignore and .actorignore apply, negations
 * included, and an ignored folder that was picked or named with --dir goes too. Only a file whose link leads out of
 * the upload stays out, as in the rest of the upload.
 */
const withActorFolderFiles = (root: string, actorPath: string, contextFiles: string[], actorFiles: string[]) => {
	// The root has its names in their case on disk, so a link that spells a folder in another case must resolve so too.
	const realRoot = realPath(root);
	const isInUpload = (file: string) => {
		try {
			return !isOutside(relative(realRoot, realPath(join(root, file))));
		} catch {
			return false;
		}
	};
	// Git lists names as its index has them: composed (NFC) on macOS, and in the old case after a case-only rename on a
	// case-insensitive file system. actorPath has the names as stored on disk, so a folder on its way matches when its
	// name differs only so and it is the same folder on disk, checked once for each spelling.
	const actorSegments = actorPath.split('/');
	const fold = (name: string) => name.normalize('NFC').toLowerCase();
	const spellings = new Map<string, boolean>();
	const isActorFolderOnTheWay = (segments: string[], depth: number) => {
		const folder = segments.slice(0, depth).join('/');
		let matches = spellings.get(folder);
		if (matches === undefined) {
			try {
				// A link named like the folder in another case, on a case-sensitive file system, is a folder of its own.
				matches =
					!lstatSync(join(root, folder)).isSymbolicLink() &&
					realPath(join(root, folder)) === join(realRoot, ...actorSegments.slice(0, depth));
			} catch {
				matches = false;
			}
			spellings.set(folder, matches);
		}
		return matches;
	};
	const contextFilesOutsideActorFolder = contextFiles.flatMap((file) => {
		const segments = file.split('/');
		let depth = 0;
		while (
			depth < actorSegments.length &&
			depth < segments.length - 1 &&
			fold(segments[depth]) === fold(actorSegments[depth]) &&
			isActorFolderOnTheWay(segments, depth + 1)
		) {
			depth++;
		}
		if (depth === actorSegments.length) return [];
		// A folder on the Actor folder's way goes under one name, as actorPath spells it, or the platform would write
		// the Actor folder and its siblings into two folders.
		return [[...actorSegments.slice(0, depth), ...segments.slice(depth)].join('/')];
	});
	return [
		...new Set([
			...contextFilesOutsideActorFolder,
			...actorFiles.map((file) => `${actorPath}/${file}`).filter(isInUpload),
		]),
	];
};

/** The config files that make a directory an Actor of its own: `.actor/actor.json`, `actor.json`, or the legacy `apify.json`. */
const OWN_CONFIG_FILES = [DEPRECATED_LOCAL_CONFIG_NAME, 'actor.json', '.actor/actor.json'];

const hasOwnConfigFile = (filePaths: string[]) => filePaths.some((filePath) => OWN_CONFIG_FILES.includes(filePath));

/** Whether the collected files include an Actor config `apify push` accepts: `.actor/`, `actor.json`, or the legacy `apify.json`. */
const hasActorConfig = (filePaths: string[]) =>
	[
		// old apify project
		DEPRECATED_LOCAL_CONFIG_NAME,
		// new apify project
		'actor.json',
		'.actor/actor.json',
		// The .actor folder existing in general
		'.actor',
	].some((filePath) => filePaths.some((fp) => fp === filePath || fp.startsWith(filePath)));

export class ActorsPushCommand extends ApifyCommand<typeof ActorsPushCommand> {
	static override name = 'push' as const;

	static override enableProfileFlag = true;

	static override description =
		`Deploys Actor to Apify platform using settings from '${LOCAL_CONFIG_PATH}'.\n` +
		`Files under '${MAX_MULTIFILE_BYTES / 1024 ** 2}' MB upload as "Multiple source files"; ` +
		`larger projects upload as ZIP file.\n` +
		`Files matched by .gitignore and .actorignore are excluded. ` +
		`Use negation patterns (e.g. !dist/) in .actorignore to force-include git-ignored files.\n` +
		`If "dockerContextDir" leads outside the Actor folder (a monorepo Actor), push uploads the whole Git repository: ` +
		`the Actor folder as above, and everything else that Git tracks or doesn't ignore (.actorignore doesn't apply there). ` +
		`Outside Git, it uploads the whole Docker context as above.\n` +
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
		{
			description: 'From the root of a repository with several Actors, deploy all of them.',
			command: 'apify push --all',
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
			description:
				'Push an Actor even when the local files are older than the Actor on the platform, or when the Actor builds from a Git repository.',
			default: false,
			required: false,
		}),
		dir: Flags.string({
			description: 'Directory where the Actor is located.',
			required: false,
		}),
		all: Flags.boolean({
			description:
				'Push every Actor found in the subdirectories, except the ones ignored by .gitignore. Works only from a directory without an Actor config of its own.',
			default: false,
			required: false,
		}),
		'allow-missing-secrets': Flags.boolean({
			description: 'Allow the command to continue even when secret values are not found in the local secrets storage.',
			required: false,
			default: false,
		}),
		'apply-env-vars-to-build': Flags.boolean({
			description: `Make the environment variables also available to the Actor build process. Use --no-apply-env-vars-to-build to turn the setting off. Overrides the value of the 'applyEnvVarsToBuild' field in the '${LOCAL_CONFIG_PATH}' file. When both the field and the flag are omitted, the setting currently stored on the platform is kept.`,
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

		// A directory without an Actor of its own may hold Actors below it; then the user picks which to push.
		// --all has no meaning in an Actor directory, so it fails there instead of being ignored.
		if (hasOwnConfigFile(filePathsToPush)) {
			if (this.flags.all) {
				error({
					message:
						"This directory is an Actor itself, so --all doesn't apply. Run the command without it, or from a directory above the Actors.",
				});
				process.exitCode = CommandExitCodes.InvalidInput;
				return;
			}
		} else {
			const actorDirs = await findActorDirs(cwd);

			if (actorDirs.length) {
				await this.pushSelected(cwd, actorDirs);
				return;
			}
		}

		const result = await this.pushActor(cwd, filePathsToPush);

		if (result && this.flags.json) {
			printJsonToStdout(result);
		}
	}

	/** Pushes the chosen Actors below `root` one after another; a failure does not stop the ones after it. */
	private async pushSelected(root: string, actorDirs: FoundActorDir[]) {
		const selected = await this.selectActorDirs(root, actorDirs);

		if (!selected) {
			return;
		}

		if (selected.length > 1 && this.args.actorId) {
			error({
				message: `The actorId argument applies to a single Actor, but ${selected.length} Actors are selected. Run apify push --dir <path> for one Actor, or drop the argument.`,
			});
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}

		const results: SelectedPushResult[] = [];
		let firstFailureExitCode: number | undefined;

		// A signal during a build wait aborts that build and the push returns; the loop then stops instead of pushing
		// the next Actor. A signal anywhere else ends the process, as it does for a single Actor, once the Actors left
		// out are named.
		let interrupted = false;
		using interruptWatcher = useSignalHandler({
			signals: INTERRUPT_SIGNALS,
			once: false,
			handler: (signal) => {
				interrupted = true;

				if (isAbortingJobOnSignal()) {
					return;
				}

				reportInterruptBeforeExit(
					selected.slice(results.length),
					this.flags.json ? { ok: false, operation: 'push', results } : undefined,
				);
				interruptWatcher[Symbol.dispose]();
				reraiseSignal(signal);
			},
		});

		for (const [index, dir] of selected.entries()) {
			info({ message: `Pushing the Actor in ${dir}` });

			// Each push reports through process.exitCode; clear it so the code read back belongs to this push.
			process.exitCode = undefined;
			let result: PushResult | undefined;

			try {
				result = await this.pushActor(join(root, dir));
			} catch (err) {
				error({ message: (err as Error).message });
				process.exitCode ||= 1;
				// Ctrl+C at a prompt (the Git-source question) ends a single push; here it stops the loop too.
				interrupted ||= (err as Error).name === 'ExitPromptError';
			}

			const exitCode = typeof process.exitCode === 'number' && process.exitCode !== 0 ? process.exitCode : undefined;
			firstFailureExitCode ??= exitCode;

			// A push that ends with neither a result nor an exit code was declined at the Git-source question.
			const entry: SelectedPushResult =
				!result && exitCode === undefined ? { dir, ok: false, skipped: true } : { dir, ...(result ?? { ok: false }) };
			if (exitCode !== undefined && entry.exitCode === undefined) {
				entry.exitCode = exitCode;
			}
			results.push(entry);

			if (interrupted) {
				const notPushed = selected.slice(index + 1);
				if (notPushed.length) {
					warning({ message: interruptedMessage(notPushed) });
				}
				break;
			}
		}

		process.exitCode = firstFailureExitCode;
		this.telemetryData.pushSelection = {
			selected: selected.length,
			failed: results.filter((entry) => !entry.ok && !entry.skipped).length,
		};

		if (this.flags.json) {
			const summary: PushSelectionResult = {
				ok: results.every((entry) => entry.ok || entry.skipped),
				operation: 'push',
				results,
			};
			const exitCode =
				firstFailureExitCode ??
				(results.every((entry) => entry.skipped || entry.exitCode !== undefined) ? 0 : undefined);
			if (exitCode !== undefined) {
				summary.exitCode = exitCode;
			}
			printJsonToStdout(summary);
		}
	}

	/**
	 * Resolves the Actor directories to push from --all or a prompt; `undefined` when the command stops here.
	 * An Actor in an ignored directory is never pushed implicitly: --all skips it, the prompt and the list mark it.
	 */
	private async selectActorDirs(root: string, actorDirs: FoundActorDir[]): Promise<string[] | undefined> {
		// Paths relative to where the command ran, so each one works as the --dir value.
		const dirForFlag = (dir: string) => toPosixRelative(process.cwd(), join(root, dir));
		const describe = ({ dir, name }: FoundActorDir) => (name ? `${dir} (${name})` : dir);
		const label = (actor: FoundActorDir) => (actor.ignored ? `${describe(actor)} ${IGNORED_TAG}` : describe(actor));

		if (this.flags.all) {
			for (const actor of actorDirs.filter(({ ignored }) => ignored)) {
				const dir = dirForFlag(actor.dir);
				info({
					message: `Skipping ${describe({ ...actor, dir })} because it's ignored by .gitignore. Run apify push --dir ${quoteForShell(dir)} to push it.`,
				});
			}

			const dirs = actorDirs.filter(({ ignored }) => !ignored).map((actor) => actor.dir);

			if (!dirs.length) {
				error({ message: 'Every Actor below this directory is ignored by .gitignore, so --all has nothing to push.' });
				process.exitCode = CommandExitCodes.NoFilesToPush;
				return;
			}

			return dirs;
		}

		const { isTTY } = await useStdin();

		if (isCI || !isTTY) {
			simpleLog({
				message: [
					'This directory has no Actor of its own, but these directories below it do:',
					...actorDirs.map((actor) => `  ${label({ ...actor, dir: dirForFlag(actor.dir) })}`),
					...(actorDirs.some(({ ignored }) => ignored) ? ['--all skips the Actors ignored by .gitignore.'] : []),
				].join('\n'),
			});
			error({ message: SELECTION_HINT });
			process.exitCode = CommandExitCodes.NoFilesToPush;
			return;
		}

		return useMultiSelectFromList({
			message: 'Which Actors do you want to push?',
			choices: actorDirs.map((actor) => ({ name: label(actor), value: actor.dir })),
			pageSize: Math.min(actorDirs.length, 15),
			loop: false,
		});
	}

	/** The single-Actor push: `cwd` is the Actor directory. Returns the result once a build was started. */
	private async pushActor(cwd: string, collectedFilePaths?: string[]): Promise<PushResult | undefined> {
		const filePathsToPush = collectedFilePaths ?? (await getActorLocalFilePaths(cwd));

		if (!filePathsToPush.length) {
			error({ message: 'You need to call this command from a folder that has an Actor in it!' });
			process.exitCode = CommandExitCodes.NoFilesToPush;
			return;
		}

		if (!hasActorConfig(filePathsToPush)) {
			error({
				message: [
					'A valid Actor could not be found in the current directory. Please make sure you are in the correct directory.',
					'You can also turn this directory into an Actor by running `apify init`.',
				].join('\n'),
			});

			process.exitCode = CommandExitCodes.NoFilesToPush;
			return;
		}

		// Everything up to the path checks is local, so a broken Actor fails the same way with or without a login.
		const actorConfigResult = await useActorConfig({ cwd });

		if (actorConfigResult.isErr()) {
			error({ message: actorConfigResult.unwrapErr().message });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config: actorConfig } = actorConfigResult.unwrap();

		// A monorepo Actor builds from a Docker context above its folder, so the push uploads its repository
		// (or, outside Git, the context) and tells the platform where the Actor lies in it.
		const dockerContext = resolveDockerContext(cwd, actorConfig?.dockerContextDir);
		if (dockerContext.kind === 'invalid') {
			error({ message: dockerContext.message });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}
		// A context inside the Actor folder ('none' or 'within') is an ordinary push of the folder.
		let actorDir = cwd;
		let uploadRoot = cwd;
		let uploadedFiles = filePathsToPush;
		let actorPath: string | undefined;
		if (dockerContext.kind === 'outside') {
			uploadRoot = dockerContext.sourceRoot;
			actorPath = dockerContext.actorPath;
			// The source root is a real path, so the Actor folder has to be one too for its paths to fall inside it.
			actorDir = join(uploadRoot, actorPath);
			const actorFolderFiles = filePathsToPush.map((file) => `${actorPath}/${file}`);
			const contextFiles = resolveLinksForUpload(
				uploadRoot,
				await getContextFilePaths(uploadRoot),
				actorPath,
				actorFolderFiles,
			);
			uploadedFiles = withActorFolderFiles(uploadRoot, actorPath, contextFiles, filePathsToPush);
		}

		// The platform resolves these paths after the upload; a wrong one builds the wrong image or fails the build.
		const pathProblems = checkActorPaths({
			actorDir,
			uploadRoot,
			uploadedFiles,
			config: actorConfig,
			// BuildKit reads the Dockerfile from the context, wherever the context lies.
			dockerContextRoot: dockerContext.kind === 'none' ? undefined : dockerContext.contextRoot,
		});
		// A readme or changelog the platform cannot find only falls back to its default, so push goes on.
		const pathWarnings = formatActorPathProblems(pathProblems, 'warning');
		if (pathWarnings) warning({ message: pathWarnings });
		const pathErrors = formatActorPathProblems(pathProblems, 'error');
		if (pathErrors) {
			error({ message: pathErrors });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		if (actorPath && readGitState(uploadRoot).dirty) {
			warning({
				message: `The repository ${uploadRoot} has uncommitted changes; the push uploads the files as they are.`,
			});
		}

		const apifyClient = await getLoggedClientOrThrow();
		const userInfo = await getCurrentUserInfo();
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
							...(actorPath ? { actorPath } : {}),
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

		const filesSize = await sumFilesSizeInBytes(uploadedFiles, uploadRoot);

		if ((filesSize < MAX_MULTIFILE_BYTES || actorPath) && !isActorCreatedNow) {
			const client = await actorClient.get();

			// Check when was files modified last
			const mostRecentModifiedFileMs = uploadedFiles.reduce((modifiedMs, filePath) => {
				const { mtimeMs, ctimeMs } = statSync(join(uploadRoot, filePath));

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
					`Actor with identifier "${actorConfig?.name || forceActorId}" already exists on the platform and has newer changes than your local copy.
Skipping push. Use --force to override.`,
				);
			}
		}

		const actorCurrentVersion = await actorClient.version(version).get();

		// A push replaces the version's source with the local files. For a Git-sourced version that also
		// drops the Git connection, so it needs an explicit go-ahead.
		if (actorCurrentVersion?.sourceType === ACTOR_SOURCE_TYPES.GIT_REPO) {
			const confirmed = await confirmGitSourceSwitch({
				actorName: actor.name,
				gitRepoUrl: actorCurrentVersion.gitRepoUrl,
				force: this.flags.force,
			});

			if (!confirmed) {
				info({ message: `Push aborted. Actor ${actor.name} still builds from its Git repository.` });
				return;
			}
		}

		let sourceType;
		let tarballUrl;
		// The platform rejects a source file name over its limit, which a deep path from the repository root can reach,
		// and measures the content as sent, where a binary file grows by a third in base64 and each character beyond the
		// Basic Multilingual Plane, such as an emoji, counts five bytes; a zip has neither limit.
		let sourceFiles =
			filesSize < MAX_MULTIFILE_BYTES && uploadedFiles.every((file) => file.length <= MAX_SOURCE_FILE_NAME_LENGTH)
				? await createSourceFiles(uploadedFiles, uploadRoot)
				: undefined;
		if (
			sourceFiles &&
			sourceFiles.reduce(
				(size, file) => size + Buffer.byteLength(file.content) + (file.content.match(/[\uD800-\uDBFF]/g)?.length ?? 0),
				0,
			) > MAX_MULTIFILE_BYTES
		) {
			sourceFiles = undefined;
		}
		if (sourceFiles) {
			sourceType = ACTOR_SOURCE_TYPES.SOURCE_FILES;
		} else {
			// Create zip
			run({ message: 'Zipping Actor files' });
			const store = await apifyClient.keyValueStores().getOrCreate(`actor-${actorId}-source`);
			// A monorepo zip has the repository layout, so it gets a key of its own for each actorPath: when the version
			// update then fails, the existing version still builds from its own record, whether it has no actorPath or
			// another one, such as the Actor folder's name before a rename.
			const key = actorPath
				? `version-${version}-monorepo-${createHash('sha256').update(actorPath).digest('hex').slice(0, 16)}.zip`
				: `version-${version}.zip`;
			const zipPath = join(tmpdir(), `apify-push-${randomUUID()}.zip`);
			try {
				await createActZip(zipPath, uploadedFiles, uploadRoot);

				// Upload it to Apify.keyValueStores
				const buffer = readFileSync(zipPath);
				await apifyClient.keyValueStore(store.id).setRecord({
					key,
					// TODO: fix this type too
					value: buffer as never,
					contentType: 'application/zip',
				});
			} finally {
				rmSync(zipPath, { force: true });
			}
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
		const envVars = actorConfig!.environmentVariables
			? transformEnvToEnvVars(actorConfig!.environmentVariables as Record<string, string>, undefined, {
					allowMissing: this.flags.allowMissingSecrets,
				})
			: undefined;
		// The flag wins when passed, then the actor.json field; undefined when neither is set, so the value
		// stored on the platform is preserved
		const applyEnvVarsToBuild =
			this.flags.applyEnvVarsToBuild ?? (actorConfig!.applyEnvVarsToBuild as boolean | undefined);

		const actorVersionSource = { tarballUrl, sourceFiles, sourceType, ...(actorPath ? { actorPath } : {}) };
		if (actorCurrentVersion) {
			const actorVersionModifier = { ...actorVersionSource, buildTag, envVars, applyEnvVarsToBuild };
			// TODO: fix this type too -.-
			await actorClient.version(version).update(actorVersionModifier as never);
			run({ message: `Updated version ${version} for Actor ${actor.name}.` });
		} else {
			const actorNewVersion = {
				versionNumber: version,
				...actorVersionSource,
				buildTag,
				envVars,
				applyEnvVarsToBuild,
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
		let build: Build | undefined = await actorClient.build(version, {
			useCache: true,
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		});

		// Forward interrupt signals (Ctrl+C, SIGTERM, SIGHUP) to a platform-side
		// abort for the lifetime of log streaming AND status polling, so the
		// build doesn't keep running after the user gives up waiting.
		using _signalHandler = useAbortJobOnSignal({
			apifyClient,
			kind: ACTOR_JOB_TYPES.BUILD,
			jobId: build.id,
		});

		try {
			const logBudgetMs = Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : undefined;
			await outputJobLog({ job: build, timeoutMillis: logBudgetMs, apifyClient });
		} catch (err) {
			warning({ message: 'Can not get log:' });
			console.error(err);
		}

		const buildId = build.id;
		build = await apifyClient.build(buildId).get();
		if (!build) {
			error({ message: `Could not fetch build with ID "${buildId}" after deployment.` });
			process.exitCode = CommandExitCodes.BuildFailed;
			return;
		}

		// `outputJobLog` can return before the build is actually terminal (stream
		// ended early, timeout hit). Poll the remaining budget so the status
		// branches below see the real outcome.
		while (!isTerminalStatus(build.status) && Date.now() < deadline) {
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
		const buildUrl = `${actorUrl}/builds/${build.buildNumber}`;

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
			return result;
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

		return result;
	}
}
