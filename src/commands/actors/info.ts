import { ActorsInfoCommandMessages } from '#i18n/commands/actors/info.js';
import type { Actor, ActorTaggedBuild, Build, User } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
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
	static override name = 'info' as const;

	static override description = 'Get information about an Actor.';

	static override examples = [
		{
			description: 'Print summary information about an Actor.',
			command: 'apify actors info apify/hello-world',
		},
		{
			description: 'Print the Actor README only.',
			command: 'apify actors info apify/hello-world --readme',
		},
		{
			description: 'Print the Actor input schema as JSON.',
			command: 'apify actors info apify/hello-world --input',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-info';

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

	async run() {
		const { actorId } = this.args;
		const { readme, input, json } = this.flags;

		const client = await getLoggedClientOrThrow();
		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client });

		if (!ctx.valid) {
			this.logger.stdout.error(this.t(ActorsInfoCommandMessages.invalidActorContext, { reason: ctx.reason }));

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
			this.logger.stdout.json(actorInfo);
			return;
		}

		const latest = actorInfo.taggedBuilds?.latest;

		if (readme) {
			if (!latest) {
				this.logger.stdout.error(this.t(ActorsInfoCommandMessages.noReadme));

				return;
			}

			if (!latest.build?.readme) {
				this.logger.stdout.error(this.t(ActorsInfoCommandMessages.noReadme));

				return;
			}

			this.logger.stdout.log(latest.build.readme);
			return;
		}

		if (input) {
			if (!latest) {
				this.logger.stdout.error(this.t(ActorsInfoCommandMessages.noInputSchema));

				return;
			}

			if (!latest.build?.inputSchema) {
				this.logger.stdout.error(this.t(ActorsInfoCommandMessages.noInputSchema));

				return;
			}

			this.logger.stdout.log(latest.build.inputSchema);
			return;
		}

		const message = [
			this.t(ActorsInfoCommandMessages.header, {
				fullName: `${actorInfo.username}/${actorInfo.name}`,
				id: actorInfo.id,
			}),
		];

		if (actorInfo.title) {
			message.push(this.t(ActorsInfoCommandMessages.titleLine, { title: actorInfo.title }));
		}

		if (actorInfo.description) {
			message.push(this.t(ActorsInfoCommandMessages.descriptionLine, { description: actorInfo.description }));
		}

		message.push(
			this.t(ActorsInfoCommandMessages.createdUpdatedLine, {
				createdAt: TimestampFormatter.display(actorInfo.createdAt),
				modifiedAt: TimestampFormatter.display(actorInfo.modifiedAt),
			}),
		);

		if (actorInfo.actorMaker) {
			message.push(
				'',
				this.t(ActorsInfoCommandMessages.madeByLine, {
					name: actorInfo.actorMaker.profile.name ?? actorInfo.actorMaker.username,
				}),
			);

			// Missing types who?
			if (Reflect.get(actorInfo, 'isCritical')) {
				message[message.length - 1] += ` ${this.t(ActorsInfoCommandMessages.maintainedByApifyBadge)}`;
			}
		}

		if (actorInfo.isPublic) {
			message.push('', this.t(ActorsInfoCommandMessages.actorIsPublic));
		} else {
			message.push('', this.t(ActorsInfoCommandMessages.actorIsPrivate));
		}

		if (actorInfo.isDeprecated) {
			message.push('', this.t(ActorsInfoCommandMessages.actorIsDeprecated));
		}

		// Pricing info
		const pricingInfo = Reflect.get(actorInfo, 'pricingInfos') as PricingInfo[] | undefined;

		if (pricingInfo?.length) {
			// We only print the latest pricing info
			const latestPricingInfo = pricingInfo.at(-1)!;

			switch (latestPricingInfo.pricingModel) {
				case 'FLAT_PRICE_PER_MONTH': {
					message.push(
						this.t(ActorsInfoCommandMessages.pricingFlatPerMonth, {
							priceLabel: `$${latestPricingInfo.pricePerUnitUsd}/month + usage`,
						}),
					);

					if (latestPricingInfo.trialMinutes) {
						const minutesToMs = latestPricingInfo.trialMinutes * 60 * 1000;
						const duration = DurationFormatter.format(minutesToMs);

						message.push(this.t(ActorsInfoCommandMessages.pricingTrialDuration, { duration }));
					}

					break;
				}
				case 'PRICE_PER_DATASET_ITEM': {
					const pricePerOneKItems = latestPricingInfo.pricePerUnitUsd * 1000;

					message.push(
						this.t(ActorsInfoCommandMessages.pricingPerDatasetItem, {
							priceLabel: `$${pricePerOneKItems.toFixed(2)} / 1,000 results`,
						}),
					);

					break;
				}
				case 'PAY_PER_EVENT': {
					message.push(this.t(ActorsInfoCommandMessages.pricingPayPerEvent));

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
					message.push(this.t(ActorsInfoCommandMessages.pricingFree));
					break;
				}

				default: {
					message.push(
						this.t(ActorsInfoCommandMessages.pricingUnknown, {
							pricingModel: latestPricingInfo.pricingModel,
						}),
					);
				}
			}
		} else {
			message.push(this.t(ActorsInfoCommandMessages.pricingFree));
		}

		// TODO: do we care about this information?
		if (actorInfo.seoTitle || actorInfo.seoDescription) {
			message.push('', this.t(ActorsInfoCommandMessages.seoHeader));

			if (actorInfo.seoTitle) {
				message.push(this.t(ActorsInfoCommandMessages.seoTitleLine, { seoTitle: actorInfo.seoTitle }));
			}

			if (actorInfo.seoDescription) {
				message.push(
					this.t(ActorsInfoCommandMessages.seoDescriptionLine, { seoDescription: actorInfo.seoDescription }),
				);
			}
		}

		if (actorInfo.taggedBuilds) {
			message.push('', this.t(ActorsInfoCommandMessages.buildsHeader));

			// Handle latest first
			const latestBuild = actorInfo.taggedBuilds.latest;

			if (latestBuild) {
				message.push(
					this.t(ActorsInfoCommandMessages.buildEntry, {
						buildNumber: latestBuild.buildNumber ?? '',
						tag: 'latest',
					}),
				);
			}

			for (const [buildTag, build] of Object.entries(actorInfo.taggedBuilds)) {
				if (buildTag === 'latest') {
					continue;
				}

				message.push(
					this.t(ActorsInfoCommandMessages.buildEntry, {
						buildNumber: build.buildNumber ?? '',
						tag: buildTag,
					}),
				);
			}
		}

		this.logger.stdout.log(message.join('\n'));
	}
}
