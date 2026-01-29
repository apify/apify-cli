import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { error, simpleLog } from '../../lib/outputs.js';
import {
	getConsoleUrlForApi,
	objectGroupBy,
	outputJobLog,
	printJsonToStdout,
	TimestampFormatter,
} from '../../lib/utils.js';

export class BuildsCreateCommand extends ApifyCommand<typeof BuildsCreateCommand> {
	static override name = 'create' as const;

	static override description = 'Creates a new build of the Actor.';

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

	static override enableJsonFlag = true;

	static override requiresAuthentication = 'always' as const;

	async run() {
		const { tag, version, json, log } = this.flags;
		const { actorId } = this.args;

		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client: this.apifyClient });

		if (!ctx.valid) {
			error({
				message: `${ctx.reason}. Please run this command in an Actor directory, or specify the Actor ID.`,
				stdout: true,
			});

			return;
		}

		const actorInfo = (await this.apifyClient.actor(ctx.id).get())!;

		const versionsByBuildTag = objectGroupBy(
			actorInfo.versions,
			(actorVersion) => actorVersion.buildTag ?? 'latest',
		);

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
				error({
					message: `The Actor Version "${version}" does not have the tag "${tag}".`,
					stdout: true,
				});

				return;
			}

			selectedVersion = version!;
			actualTag = specificVersionExists.buildTag ?? 'latest';
		} else if (taggedVersions) {
			selectedVersion = taggedVersions[0].versionNumber!;
			actualTag = tag ?? 'latest';

			if (taggedVersions.length > 1) {
				if (!version) {
					error({
						message: `Multiple Actor versions with the tag "${tag}" found. Please specify the version number using the "--version" flag.\n  Available versions for this tag: ${taggedVersions.map((v) => chalk.yellow(v.versionNumber)).join(', ')}`,
						stdout: true,
					});

					return;
				}

				// On second run, it will call the upper if check
			}
		}

		if (!selectedVersion) {
			error({
				message: `No Actor versions with the tag "${tag}" found. You can push a new version with this tag by using "apify push --build-tag=${tag}".`,
				stdout: true,
			});

			return;
		}

		const build = await this.apifyClient.actor(ctx.id).build(selectedVersion, { tag });

		if (json) {
			printJsonToStdout(build);
			return;
		}

		const message: string[] = [
			`${chalk.yellow('Actor')}: ${actorInfo?.username ? `${actorInfo.username}/` : ''}${actorInfo?.name ?? 'unknown-actor'} (${chalk.gray(build.actId)})`,
			`  ${chalk.yellow('Version')}: ${selectedVersion} (tagged with ${chalk.yellow(actualTag)})`,
			'',
			`${chalk.greenBright('Build Started')} (ID: ${chalk.gray(build.id)})`,
			`  ${chalk.yellow('Build Number')}: ${build.buildNumber} (will get tagged once finished)`,
			`  ${chalk.yellow('Started')}: ${TimestampFormatter.display(build.startedAt)}`,
			'',
		];

		const url = `${getConsoleUrlForApi(this.apifyClient.publicBaseUrl)}/actors/${build.actId}/builds/${build.buildNumber}`;
		const viewMessage = `${chalk.blue('View in Apify Console')}: ${url}`;

		simpleLog({
			message: message.join('\n'),
			stdout: true,
		});

		if (log) {
			try {
				await outputJobLog({ job: build, apifyClient: this.apifyClient });
			} catch (err) {
				// This should never happen...
				error({
					message: `Failed to print log for build with ID "${build.id}": ${(err as Error).message}`,
					stdout: true,
				});
			}

			// Print out an empty line
			simpleLog({
				message: '',
				stdout: true,
			});
		}

		simpleLog({
			message: viewMessage,
			stdout: true,
		});
	}
}
