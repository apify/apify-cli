import { Args } from '@oclif/core';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { DurationFormatter, getLoggedClientOrThrow, TimestampFormatter } from '../../lib/utils.js';

export class BuildInfoCommand extends ApifyCommand<typeof BuildInfoCommand> {
	static override description = 'Prints information about a specific build';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build id to get information about',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { buildId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account` });
			return;
		}

		// JSON output -> return the object (which is handled by oclif)
		if (this.flags.json) {
			return build;
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

		const exitCode = Reflect.get(build, 'exitCode') as number | undefined;

		const message: string[] = [
			//
			`${chalk.yellow('Actor')}: ${actor?.username ? `${actor.username}/` : ''}${actor?.name ?? 'unknown-actor'} (${chalk.gray(build.actId)})`,
			'',
			`${chalk.yellow('Build Information')} (ID: ${chalk.gray(build.id)})`,
			`  ${chalk.yellow('Build Number')}: ${build.buildNumber}${buildTag ? ` (tagged as ${chalk.yellow(buildTag)})` : ''}`,
			// exitCode is also not typed...
			`  ${chalk.yellow('Status')}: ${prettyPrintStatus(build.status)}${typeof exitCode !== 'undefined' ? ` (exit code: ${chalk.gray(exitCode)})` : ''}`,
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

		// Untyped field again 😢
		const dockerImageSize = Reflect.get(build.stats ?? {}, 'imageSizeBytes') as number | undefined;

		if (dockerImageSize) {
			message.push(`  ${chalk.yellow('Docker Image Size')}: ${prettyPrintBytes(dockerImageSize)}`);
		}

		message.push(`  ${chalk.yellow('Origin')}: ${build.meta.origin ?? 'UNKNOWN'}`);

		message.push('');

		const url = `https://console.apify.com/actors/${build.actId}/builds/${build.buildNumber}`;

		message.push(`${chalk.blue('View in Apify Console')}: ${url}`);

		simpleLog({ message: message.join('\n') });

		return undefined;
	}
}
