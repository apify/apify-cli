import { BuildsCreateCommandMessages } from '#i18n/commands/builds/create.js';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { useAbortJobOnSignal } from '../../lib/hooks/useAbortJobOnSignal.js';
import { getLoggedClientOrThrow, objectGroupBy, outputJobLog, TimestampFormatter } from '../../lib/utils.js';

export class BuildsCreateCommand extends ApifyCommand<typeof BuildsCreateCommand> {
	static override name = 'create' as const;

	static override description = 'Creates a new build of the Actor.';

	static override examples = [
		{
			description: 'Build the Actor in the current directory with the default "latest" tag.',
			command: 'apify builds create',
		},
		{
			description: 'Build a specific Actor with a custom tag and stream the build log.',
			command: 'apify builds create apify/hello-world --tag beta --log',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-create';

	static override flags = {
		tag: Flags.string({
			description: 'Build tag to be applied to the successful Actor build. By default, this is "latest".',
		}),
		version: Flags.string({
			description:
				'Optional Actor Version to build. By default, this will be inferred from the tag, but this flag is required when multiple versions have the same tag.',
			required: false,
		}),
		log: Flags.boolean({
			description: 'Whether to print out the build log after the build is triggered.',
		}),
	};

	static override args = {
		actorId: Args.string({
			description:
				'Optional Actor ID or Name to trigger a build for. By default, it will use the Actor from the current directory.',
		}),
	};

	async run() {
		const { tag, version, json, log } = this.flags;
		const { actorId } = this.args;

		const client = await getLoggedClientOrThrow();

		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client });

		if (!ctx.valid) {
			this.logger.stdout.error(this.t(BuildsCreateCommandMessages.invalidActorContext, { reason: ctx.reason }));

			return;
		}

		const actorInfo = (await client.actor(ctx.id).get())!;

		const versionsByBuildTag = objectGroupBy(actorInfo.versions, (actorVersion) => actorVersion.buildTag ?? 'latest');

		const taggedVersions = versionsByBuildTag[tag ?? 'latest'];
		const specificVersionExists = actorInfo.versions.find((v) => v.versionNumber === version);

		let selectedVersion: string | undefined;
		let actualTag = tag;

		// --version takes precedence over tagged versions (but if --tag is also specified, it will be checked again)
		if (specificVersionExists) {
			// The API doesn't really care if the tag you use for a version is correct or not, just that the version exists. This means you CAN have two separate versions with the same tag
			// but only the latest one that gets built will have the tag.
			// The *console* lets you pick a version to build. Multiple versions can have the same default tag, ergo what was written above.
			// The API *does* also let you tag any existing version with whatever you want. This is where we diverge, and follow semi-console-like behavior. Effectively, this one if check prevents you from doing
			// "--version 0.1 --tag not_actually_the_tag", even if that is technically perfectly valid. Future reader of this code, if this is not wanted, nuke the if check.

			// This ensures that a --tag and --version match the version and tag the platform knows about
			// but only when --tag is provided
			if (tag && (!taggedVersions || !taggedVersions.some((v) => v.versionNumber === version))) {
				this.logger.stdout.error(
					this.t(BuildsCreateCommandMessages.versionDoesNotHaveTag, { version: version!, tag }),
				);

				return;
			}

			selectedVersion = version!;
			actualTag = specificVersionExists.buildTag ?? 'latest';
		} else if (taggedVersions) {
			selectedVersion = taggedVersions[0].versionNumber!;
			actualTag = tag ?? 'latest';

			if (taggedVersions.length > 1) {
				if (!version) {
					this.logger.stdout.error(
						this.t(BuildsCreateCommandMessages.multipleVersionsForTag, {
							tag: tag!,
							availableVersions: taggedVersions.map((v) => chalk.yellow(v.versionNumber)).join(', '),
						}),
					);

					return;
				}

				// On second run, it will call the upper if check
			}
		}

		if (!selectedVersion) {
			this.logger.stdout.error(this.t(BuildsCreateCommandMessages.noVersionsForTag, { tag: tag! }));

			return;
		}

		const build = await client.actor(ctx.id).build(selectedVersion, { tag });

		if (json) {
			this.logger.stdout.json(build);
			return;
		}

		const fullActorName = `${actorInfo?.username ? `${actorInfo.username}/` : ''}${actorInfo?.name ?? 'unknown-actor'}`;

		this.logger.stdout.log(
			this.t(BuildsCreateCommandMessages.buildStartedMessage, {
				fullActorName,
				actId: build.actId,
				selectedVersion,
				actualTag: actualTag!,
				buildId: build.id,
				buildNumber: build.buildNumber!,
				startedAt: TimestampFormatter.display(build.startedAt),
			}),
		);

		const url = `https://console.apify.com/actors/${build.actId}/builds/${build.buildNumber}`;
		const viewMessage = this.t(BuildsCreateCommandMessages.viewInConsole, { url });

		if (log) {
			// While the log is streaming, forward interrupt signals to a
			// platform-side abort so the build doesn't keep running after the
			// user gives up waiting (Ctrl+C, SIGTERM from a parent process,
			// SIGHUP from a closing terminal). The `using` binding guarantees
			// the listener is removed when the block exits.
			using _signalHandler = useAbortJobOnSignal({
				apifyClient: client,
				kind: 'build',
				jobId: build.id,
			});

			try {
				await outputJobLog({ job: build, apifyClient: client });
			} catch (err) {
				// This should never happen...
				this.logger.stdout.error(
					this.t(BuildsCreateCommandMessages.logFailed, {
						buildId: build.id,
						message: (err as Error).message,
					}),
				);
			}

			// Print out an empty line
			this.logger.stdout.log('');
		}

		this.logger.stdout.log(viewMessage);
	}
}
