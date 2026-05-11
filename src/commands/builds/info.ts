import { BuildsInfoCommandMessages } from '#i18n/commands/builds/info.js';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { DurationFormatter, getLoggedClientOrThrow, TimestampFormatter } from '../../lib/utils.js';

export class BuildsInfoCommand extends ApifyCommand<typeof BuildsInfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints information about a specific build.';

	static override examples = [
		{
			description: 'Print information about a build.',
			command: 'apify builds info <buildId>',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-info';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build ID to get information about.',
		}),
	};

	async run() {
		const { buildId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			this.logger.stdout.error(this.t(BuildsInfoCommandMessages.buildNotFound, { buildId }));
			return;
		}

		// JSON output -> return the object (which is handled by oclif)
		if (this.flags.json) {
			this.logger.stdout.json(build);
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		let buildTag: string | undefined;

		if (actor?.taggedBuilds) {
			for (const [tag, buildData] of Object.entries(actor.taggedBuilds)) {
				if (buildData.buildId === build.id) {
					buildTag = tag;
					break;
				}
			}
		}

		// TODO: untyped field, https://github.com/apify/apify-client-js/issues/526
		const exitCode = Reflect.get(build, 'exitCode') as number | undefined;

		const fullActorName = actor?.username ? `${actor.username}/${actor.name}` : (actor?.name ?? 'unknown-actor');
		const versionTaggedAs = buildTag ? this.t(BuildsInfoCommandMessages.versionTaggedAs, { buildTag }) : '';
		const exitCodeStatus =
			typeof exitCode !== 'undefined'
				? this.t(BuildsInfoCommandMessages.exitCodeStatus, { exitCode: String(exitCode) })
				: '';

		const message: string[] = [
			this.t(BuildsInfoCommandMessages.header, {
				fullActorName,
				actId: build.actId,
				buildId: build.id,
				buildNumber: build.buildNumber!,
				versionTaggedAs,
				status: prettyPrintStatus(build.status),
				exitCodeStatus,
				startedAt: TimestampFormatter.display(build.startedAt),
			}),
		];

		if (build.finishedAt) {
			message.push(
				this.t(BuildsInfoCommandMessages.finishedAtLine, {
					finishedAt: TimestampFormatter.display(build.finishedAt),
					duration: DurationFormatter.format(build.stats?.durationMillis ?? 0),
				}),
			);
		} else {
			const diff = Date.now() - build.startedAt.getTime();
			message.push(
				this.t(BuildsInfoCommandMessages.runningForLine, {
					duration: DurationFormatter.format(diff),
				}),
			);
		}

		if (build.stats?.computeUnits) {
			// Platform shows 3 decimal places, so shall we
			message.push(
				this.t(BuildsInfoCommandMessages.computeUnitsLine, {
					computeUnits: build.stats.computeUnits.toFixed(3),
				}),
			);
		}

		// TODO: untyped field, https://github.com/apify/apify-client-js/issues/526
		const dockerImageSize = Reflect.get(build.stats ?? {}, 'imageSizeBytes') as number | undefined;

		if (dockerImageSize) {
			message.push(
				this.t(BuildsInfoCommandMessages.dockerImageSizeLine, {
					size: prettyPrintBytes({ bytes: dockerImageSize }),
				}),
			);
		}

		message.push(this.t(BuildsInfoCommandMessages.originLine, { origin: build.meta.origin ?? 'UNKNOWN' }));

		message.push('');

		const url = `https://console.apify.com/actors/${build.actId}/builds/${build.buildNumber}`;

		message.push(this.t(BuildsInfoCommandMessages.viewInConsole, { url }));

		this.logger.stdout.log(message.join('\n'));
	}
}
