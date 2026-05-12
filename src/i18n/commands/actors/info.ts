import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsInfoCommandMessages = defineMessages({
	en: {
		invalidActorContext: {
			markdown: '{reason}. Please specify the Actor ID.',
			json: () => null,
		},
		noReadme: {
			markdown: 'No README found for this Actor.',
			json: () => null,
		},
		noInputSchema: {
			markdown: 'No input schema found for this Actor.',
			json: () => null,
		},
		header: {
			markdown: (md, colors) => md(`Information about Actor ${colors.yellow('{fullName}')} (${colors.gray('{id}')})\n`),
			json: () => null,
		},
		titleLine: {
			markdown: (md, colors) => md(`${colors.yellow('Title:')} ${colors.bold('{title}')}`),
			json: () => null,
		},
		descriptionLine: {
			markdown: (md, colors) => md(`${colors.yellow('Description:')} {description}`),
			json: () => null,
		},
		createdUpdatedLine: {
			markdown: (md, colors) =>
				md(
					`${colors.yellow('Created at:')} ${colors.cyan('{createdAt}')} ${colors.gray('|')} ${colors.yellow('Updated at:')} ${colors.cyan('{modifiedAt}')}`,
				),
			json: () => null,
		},
		madeByLine: {
			markdown: (md, colors) => md(`${colors.yellow('Made by:')} ${colors.cyan('{name}')}`),
			json: () => null,
		},
		maintainedByApifyBadge: {
			markdown: (md, colors) => md(colors.bgGray('Maintained by Apify')),
			json: () => null,
		},
		actorIsPublic: {
			markdown: (md, colors) => md(`${colors.yellow('Actor is')} ${colors.green('PUBLIC')}`),
			json: () => null,
		},
		actorIsPrivate: {
			markdown: (md, colors) => md(`${colors.yellow('Actor is')} ${colors.cyan('PRIVATE')}`),
			json: () => null,
		},
		actorIsDeprecated: {
			markdown: (md, colors) => md(`${colors.yellow('Actor is')} ${colors.red('DEPRECATED')}`),
			json: () => null,
		},
		pricingFlatPerMonth: {
			markdown: (md, colors) => md(`${colors.yellow('Pricing information:')} ${colors.bgGray(`{priceLabel}`)}`),
			json: () => null,
		},
		pricingTrialDuration: {
			markdown: (md, colors) => md(`     ${colors.yellow('Trial duration:')} ${colors.bold('{duration}')}`),
			json: () => null,
		},
		pricingPerDatasetItem: {
			markdown: (md, colors) => md(`${colors.yellow('Pricing information:')} ${colors.bgGray(`{priceLabel}`)}`),
			json: () => null,
		},
		pricingPayPerEvent: {
			markdown: (md, colors) => md(`${colors.yellow('Pricing information:')} ${colors.bgGray('Pay per event')}`),
			json: () => null,
		},
		pricingFree: {
			markdown: (md, colors) => md(`${colors.yellow('Pricing information:')} ${colors.bgGray('Pay for usage')}`),
			json: () => null,
		},
		pricingUnknown: {
			markdown: (md, colors) =>
				md(
					`${colors.yellow('Pricing information:')} ${colors.bgGray(`Unknown pricing model (${colors.yellow('{pricingModel}')})`)}`,
				),
			json: () => null,
		},
		seoHeader: {
			markdown: (md, colors) => md(colors.yellow('SEO information:')),
			json: () => null,
		},
		seoTitleLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Title:')} {seoTitle}`),
			json: () => null,
		},
		seoDescriptionLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Description:')} {seoDescription}`),
			json: () => null,
		},
		buildsHeader: {
			markdown: (md, colors) => md(colors.yellow('Builds:')),
			json: () => null,
		},
		buildEntry: {
			markdown: (md, colors) =>
				md(`  ${colors.yellow('-')} ${colors.cyan('{buildNumber}')} ${colors.gray('/')} ${colors.yellow('{tag}')}`),
			json: () => null,
		},
	},
});
