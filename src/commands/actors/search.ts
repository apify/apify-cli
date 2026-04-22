import { ApifyClient } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { error, info, simpleLog } from '../../lib/outputs.js';
import { getApifyClientOptions, printJsonToStdout } from '../../lib/utils.js';

const pricingModelLabels: Record<string, string> = {
	FREE: 'Free',
	FLAT_PRICE_PER_MONTH: 'Subscription',
	PRICE_PER_DATASET_ITEM: 'Pay per result',
	PAY_PER_EVENT: 'Pay per event',
};

function formatPricingModel(model?: string): string {
	if (!model) return chalk.gray('Unknown');

	return pricingModelLabels[model] ?? model;
}

function truncateDescription(description?: string, maxLength = 60): string {
	if (!description) return '';

	if (description.length <= maxLength) return description;

	return `${description.slice(0, maxLength - 1)}…`;
}

export class ActorsSearchCommand extends ApifyCommand<typeof ActorsSearchCommand> {
	static override name = 'search' as const;

	static override description =
		'Searches Actors in the Apify Store.\n\nSearches the Apify Store for Actors matching the given query. Results can be filtered by category, author, pricing model, and more. This command does not require authentication.';

	static override examples = [
		{
			description: 'Search the Apify Store for "web scraper" Actors.',
			command: 'apify actors search "web scraper"',
		},
		{
			description: 'Search for TikTok Actors sorted by popularity, limit to 5 results.',
			command: 'apify actors search "tiktok" --limit 5 --sort-by popularity',
		},
		{
			description: 'Find free AI Actors.',
			command: 'apify actors search "ai" --category AI --pricing-model FREE',
		},
		{
			description: 'Output results as JSON for scripting.',
			command: 'apify actors search "web scraper" --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-search';

	static override args = {
		query: Args.string({
			description: 'Search query to find Actors by title, name, description, username, or readme.',
			required: false,
		}),
	};

	static override flags = {
		'sort-by': Flags.string({
			description: 'Sort order for the results.',
			options: ['relevance', 'popularity', 'newest', 'lastUpdate'],
			default: 'relevance',
		}),
		category: Flags.string({
			description: 'Filter by category (e.g. AI).',
		}),
		username: Flags.string({
			description: 'Filter by Actor author username.',
		}),
		'pricing-model': Flags.string({
			description: 'Filter by pricing model.',
			options: ['FREE', 'FLAT_PRICE_PER_MONTH', 'PRICE_PER_DATASET_ITEM', 'PAY_PER_EVENT'],
		}),
		limit: Flags.integer({
			description: 'Maximum number of results to return.',
			default: 20,
		}),
		offset: Flags.integer({
			description: 'Number of results to skip for pagination.',
			default: 0,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { query } = this.args;
		const { json, sortBy, category, username, pricingModel, limit, offset } = this.flags;

		const clientOptions = getApifyClientOptions();
		delete clientOptions.token;
		const client = new ApifyClient(clientOptions);

		let result;

		try {
			result = await client.store().list({
				search: query,
				sortBy,
				category,
				username,
				pricingModel,
				limit,
				offset,
			});
		} catch (err) {
			process.exitCode = CommandExitCodes.RunFailed;
			error({
				message: `Failed to search Apify Store: ${err instanceof Error ? err.message : String(err)}`,
				stdout: true,
			});
			return;
		}

		if (result.count === 0) {
			if (json) {
				printJsonToStdout(result);
				return;
			}

			info({ message: 'No Actors found matching your search.', stdout: true });
			return;
		}

		if (json) {
			printJsonToStdout(result);
			return;
		}

		const table = new ResponsiveTable({
			allColumns: ['Name', 'Description', 'Users (30d)', 'Pricing'],
			mandatoryColumns: ['Name', 'Pricing'],
			columnAlignments: {
				'Users (30d)': 'right',
				Name: 'left',
			},
		});

		for (const item of result.items) {
			table.pushRow({
				Name: `${item.title}\n${chalk.gray(`${item.username}/${item.name}`)}`,
				Description: truncateDescription(item.description),
				'Users (30d)': chalk.cyan(`${item.stats?.totalUsers30Days ?? 0}`),
				Pricing: formatPricingModel(item.currentPricingInfo?.pricingModel),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}
}
