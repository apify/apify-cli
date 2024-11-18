import { Args, Flags } from '@oclif/core';
import type { Actor, ActorTaggedBuild, Build, User } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { DurationFormatter, getLoggedClientOrThrow, TimestampFormatter } from '../../lib/utils.js';

interface HydratedActorInfo extends Omit<Actor, 'taggedBuilds'> {
	taggedBuilds?: Record<string, ActorTaggedBuild & { build?: Build }>;
	actorMaker?: User;
}

interface PricingInfo {
	pricingModel: 'PRICE_PER_DATASET_ITEM' | 'FLAT_PRICE_PER_MONTH' | 'PAY_PER_EVENT' | 'FREE';
	pricePerUnitUsd: number;
	unitName: string;
	startedAt: string;
	createdAt: string;
	apifyMarginPercentage: number;
	notifiedAboutFutureChangeAt: string;
	notifiedAboutChangeAt: string;
	trialMinutes?: number;
	pricingPerEvent?: {
		actorChargeEvents: Record<string, { eventTitle: string; eventDescription: string; eventPriceUsd: number }>;
	};
}

const eventTitleColumn = '\u200b';
const eventPriceUsdColumn = '\u200b\u200b';

const payPerEventTable = new ResponsiveTable({
	allColumns: [eventTitleColumn, eventPriceUsdColumn],
	mandatoryColumns: [eventTitleColumn, eventPriceUsdColumn],
	columnAlignments: {
		[eventTitleColumn]: 'left',
		[eventPriceUsdColumn]: 'right',
	},
});

export class ActorsInfoCommand extends ApifyCommand<typeof ActorsInfoCommand> {
	static override description = 'Get information about an Actor.';

	static override flags = {
		readme: Flags.boolean({
			description: 'Return the Actor README.',
			exclusive: ['input'],
		}),
		input: Flags.boolean({
			description: 'Return the Actor input schema.',
			exclusive: ['readme'],
		}),
	};

	static override args = {
		actorId: Args.string({
			description: 'The ID of the Actor to return information about.',
			required: true,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { actorId } = this.args;
		const { readme, input, json } = this.flags;

		const client = await getLoggedClientOrThrow();
		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client });

		if (!ctx.valid) {
			error({
				message: `${ctx.reason}. Please specify the Actor ID.`,
				stdout: true,
			});

			return;
		}

		const actorInfo = (await client.actor(ctx.id).get())! as HydratedActorInfo;
		const actorMaker = await client.user(actorInfo.userId).get();

		actorInfo.actorMaker = actorMaker;

		// Hydrate builds
		for (const taggedBuild of Object.values(actorInfo.taggedBuilds ?? {})) {
			if (!taggedBuild.buildId) {
				continue;
			}

			const buildData = await client.build(taggedBuild.buildId).get();

			taggedBuild.build = buildData;
		}

		if (json) {
			return actorInfo;
		}

		const latest = actorInfo.taggedBuilds?.latest;

		if (readme) {
			if (!latest) {
				error({
					message: 'No README found for this Actor.',
					stdout: true,
				});

				return;
			}

			if (!latest.build?.readme) {
				error({
					message: 'No README found for this Actor.',
					stdout: true,
				});

				return;
			}

			simpleLog({ message: latest.build.readme, stdout: true });
		}

		if (input) {
			if (!latest) {
				error({
					message: 'No input schema found for this Actor.',
					stdout: true,
				});

				return;
			}

			if (!latest.build?.inputSchema) {
				error({
					message: 'No input schema found for this Actor.',
					stdout: true,
				});

				return;
			}

			simpleLog({ message: latest.build.inputSchema, stdout: true });
		}

		const message = [
			`Information about Actor ${chalk.yellow(`${actorInfo.username}/${actorInfo.name}`)} (${chalk.gray(actorInfo.id)})`,
			'',
		];

		if (actorInfo.title) {
			message.push(`${chalk.yellow('Title:')} ${chalk.bold(actorInfo.title)}`);
		}

		if (actorInfo.description) {
			message.push(`${chalk.yellow('Description:')} ${actorInfo.description}`);
		}

		message.push(
			`${chalk.yellow('Created at:')} ${chalk.cyan(TimestampFormatter.display(actorInfo.createdAt))} ${chalk.gray('|')} ${chalk.yellow('Updated at:')} ${chalk.cyan(
				TimestampFormatter.display(actorInfo.modifiedAt),
			)}`,
		);

		if (actorInfo.actorMaker) {
			message.push(
				'',
				`${chalk.yellow('Made by:')} ${chalk.cyan(actorInfo.actorMaker.profile.name ?? actorInfo.actorMaker.username)}`,
			);

			// Missing types who?
			if (Reflect.get(actorInfo, 'isCritical')) {
				message[message.length - 1] += ` ${chalk.bgGray('Maintained by Apify')}`;
			}
		}

		if (actorInfo.isPublic) {
			message.push('', `${chalk.yellow('Actor is')} ${chalk.green('PUBLIC')}`);
		} else {
			message.push('', `${chalk.yellow('Actor is')} ${chalk.cyan('PRIVATE')}`);
		}

		if (actorInfo.isDeprecated) {
			message.push('', `${chalk.yellow('Actor is')} ${chalk.red('DEPRECATED')}`);
		}

		// Pricing info
		const pricingInfo = Reflect.get(actorInfo, 'pricingInfos') as PricingInfo[] | undefined;

		if (pricingInfo?.length) {
			// We only print the latest pricing info
			const latestPricingInfo = pricingInfo.at(-1)!;

			switch (latestPricingInfo.pricingModel) {
				case 'FLAT_PRICE_PER_MONTH': {
					message.push(
						`${chalk.yellow('Pricing information:')} ${chalk.bgGray(`$${latestPricingInfo.pricePerUnitUsd}/month + usage`)}`,
					);

					if (latestPricingInfo.trialMinutes) {
						const minutesToMs = latestPricingInfo.trialMinutes * 60 * 1000;
						const duration = DurationFormatter.format(minutesToMs);

						message.push(`     ${chalk.yellow('Trial duration:')} ${chalk.bold(duration)}`);
					}

					break;
				}
				case 'PRICE_PER_DATASET_ITEM': {
					const pricePerOneKItems = latestPricingInfo.pricePerUnitUsd * 1000;

					message.push(
						`${chalk.yellow('Pricing information:')} ${chalk.bgGray(`$${pricePerOneKItems.toFixed(2)} / 1,000 results`)}`,
					);

					break;
				}
				case 'PAY_PER_EVENT': {
					message.push(`${chalk.yellow('Pricing information:')} ${chalk.bgGray('Pay per event')}`);

					const events = Object.values(latestPricingInfo.pricingPerEvent?.actorChargeEvents ?? {});

					for (const eventInfo of events) {
						payPerEventTable.pushRow({
							[eventTitleColumn]: eventInfo.eventTitle,
							[eventPriceUsdColumn]: chalk.bold(`$${eventInfo.eventPriceUsd.toFixed(2)}`),
						});
					}

					const rendered = payPerEventTable.render(CompactMode.VeryCompact);
					const split = rendered.split('\n');

					// Remove the second line
					split.splice(1, 1);

					message.push(split.join('\n'));

					break;
				}

				case 'FREE': {
					message.push(`${chalk.yellow('Pricing information:')} ${chalk.bgGray('Pay for usage')}`);
					break;
				}

				default: {
					message.push(
						`${chalk.yellow('Pricing information:')} ${chalk.bgGray(`Unknown pricing model (${chalk.yellow(latestPricingInfo.pricingModel)})`)}`,
					);
				}
			}
		} else {
			message.push(`${chalk.yellow('Pricing information:')} ${chalk.bgGray('Pay for usage')}`);
		}

		// TODO: do we care about this information?
		if (actorInfo.seoTitle || actorInfo.seoDescription) {
			message.push('', chalk.yellow('SEO information:'));

			if (actorInfo.seoTitle) {
				message.push(`  ${chalk.yellow('Title:')} ${actorInfo.seoTitle}`);
			}

			if (actorInfo.seoDescription) {
				message.push(`  ${chalk.yellow('Description:')} ${actorInfo.seoDescription}`);
			}
		}

		if (actorInfo.taggedBuilds) {
			message.push('', chalk.yellow('Builds:'));

			// Handle latest first
			const latestBuild = actorInfo.taggedBuilds.latest;

			if (latestBuild) {
				message.push(
					`  ${chalk.yellow('-')} ${chalk.cyan(latestBuild.buildNumber)} ${chalk.gray('/')} ${chalk.yellow('latest')}`,
				);
			}

			for (const [buildTag, build] of Object.entries(actorInfo.taggedBuilds)) {
				if (buildTag === 'latest') {
					continue;
				}

				message.push(
					`  ${chalk.yellow('-')} ${chalk.cyan(build.buildNumber)} ${chalk.gray('/')} ${chalk.yellow(buildTag)}`,
				);
			}
		}

		simpleLog({ message: message.join('\n'), stdout: true });

		return undefined;
	}
}
