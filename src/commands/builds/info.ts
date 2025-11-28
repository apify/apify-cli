import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { DurationFormatter, printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

export class BuildsInfoCommand extends ApifyCommand<typeof BuildsInfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints information about a specific build.';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build ID to get information about.',
		}),
	};

	static override enableJsonFlag = true;

	static override requiresAuthentication = 'always' as const;

	async run() {
		const { buildId } = this.args;

		const build = await this.apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		// JSON output -> return the object (which is handled by oclif)
		if (this.flags.json) {
			printJsonToStdout(build);
			return;
		}

		const actor = await this.apifyClient.actor(build.actId).get();

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
		const versionTaggedAs = buildTag ? ` (tagged as ${chalk.yellow(buildTag)})` : '';
		const exitCodeStatus = typeof exitCode !== 'undefined' ? ` (exit code: ${chalk.gray(exitCode)})` : '';

		const message: string[] = [
			//
			`${chalk.yellow('Actor')}: ${fullActorName} (${chalk.gray(build.actId)})`,
			'',
			`${chalk.yellow('Build Information')} (ID: ${chalk.gray(build.id)})`,
			`  ${chalk.yellow('Build Number')}: ${build.buildNumber}${versionTaggedAs}`,
			`  ${chalk.yellow('Status')}: ${prettyPrintStatus(build.status)}${exitCodeStatus}`,
			`  ${chalk.yellow('Started')}: ${TimestampFormatter.display(build.startedAt)}`,
		];

		if (build.finishedAt) {
			message.push(
				`  ${chalk.yellow('Finished')}: ${TimestampFormatter.display(build.finishedAt)} (took ${chalk.gray(DurationFormatter.format(build.stats?.durationMillis ?? 0))})`,
			);
		} else {
			const diff = Date.now() - build.startedAt.getTime();
			message.push(
				`  ${chalk.yellow('Finished')}: ${chalk.gray(`Running for ${DurationFormatter.format(diff)}`)}`,
			);
		}

		if (build.stats?.computeUnits) {
			// Platform shows 3 decimal places, so shall we
			message.push(`  ${chalk.yellow('Compute Units')}: ${build.stats.computeUnits.toFixed(3)}`);
		}

		// TODO: untyped field, https://github.com/apify/apify-client-js/issues/526
		const dockerImageSize = Reflect.get(build.stats ?? {}, 'imageSizeBytes') as number | undefined;

		if (dockerImageSize) {
			message.push(`  ${chalk.yellow('Docker Image Size')}: ${prettyPrintBytes({ bytes: dockerImageSize })}`);
		}

		message.push(`  ${chalk.yellow('Origin')}: ${build.meta.origin ?? 'UNKNOWN'}`);

		message.push('');

		const url = `https://console.apify.com/actors/${build.actId}/builds/${build.buildNumber}`;

		message.push(`${chalk.blue('View in Apify Console')}: ${url}`);

		simpleLog({ message: message.join('\n'), stdout: true });
	}
}
