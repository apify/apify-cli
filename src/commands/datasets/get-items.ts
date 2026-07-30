import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { DownloadItemsFormat } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const downloadFormatToContentType: Record<DownloadItemsFormat, string> = {
	[DownloadItemsFormat.JSON]: 'application/json',
	[DownloadItemsFormat.JSONL]: 'application/jsonl',
	[DownloadItemsFormat.CSV]: 'text/csv',
	[DownloadItemsFormat.HTML]: 'text/html',
	[DownloadItemsFormat.RSS]: 'application/rss+xml',
	[DownloadItemsFormat.XML]: 'application/xml',
	[DownloadItemsFormat.XLSX]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function parseCsvList(value: string | undefined): string[] | undefined {
	if (!value) {
		return undefined;
	}

	const parts = value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

	return parts.length > 0 ? parts : undefined;
}

export class DatasetsGetItems extends ApifyCommand<typeof DatasetsGetItems> {
	static override name = 'get-items' as const;

	static override description =
		'Retrieves dataset items in a specified format (JSON, CSV, etc).\n' +
		'Supports field selection, cleaning empty/hidden values, and writing directly to a file.';

	static override examples = [
		{
			description: 'Print all items from a dataset as JSON.',
			command: 'apify datasets get-items <datasetId>',
		},
		{
			description: 'Export the first 100 items as CSV to a file.',
			command: 'apify datasets get-items <datasetId> --format csv --limit 100 --output items.csv',
		},
		{
			description: 'Export only selected fields, skipping empty items.',
			command: 'apify datasets get-items <datasetId> --fields url,title --clean',
		},
		{
			description: 'Paginate: skip the first 500 items, return the next 500.',
			command: 'apify datasets get-items <datasetId> --offset 500 --limit 500',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets-get-items';

	static override flags = {
		limit: Flags.integer({
			description: 'The amount of elements to get from the dataset. By default, it will return all available items.',
		}),
		offset: Flags.integer({
			description: 'The offset in the dataset where to start getting items.',
		}),
		format: Flags.string({
			description: "The format of the returned output. By default, it is set to 'json'.",
			choices: Object.keys(downloadFormatToContentType) as DownloadItemsFormat[],
			default: DownloadItemsFormat.JSON,
		}),
		fields: Flags.string({
			description: 'Comma-separated list of fields to include in each item (all other fields are omitted).',
		}),
		omit: Flags.string({
			description: 'Comma-separated list of fields to exclude from each item.',
		}),
		unwind: Flags.string({
			description:
				'Comma-separated list of fields to unwind. Each array value creates a separate item (same as the Dataset API).',
		}),
		clean: Flags.boolean({
			description: 'Return only non-empty items and skip hidden fields (fields starting with #).',
			default: false,
		}),
		desc: Flags.boolean({
			description: 'Return items in descending order (newest first).',
			default: false,
		}),
		output: Flags.string({
			description: 'Write items to this file path instead of stdout. Content-Type still goes to stderr.',
			char: 'o',
		}),
	};

	static override args = {
		datasetId: Args.string({
			description: 'The ID of the Dataset to export the items for.',
			required: true,
		}),
	};

	async run() {
		const { limit, offset, format, fields, omit, unwind, clean, desc, output } = this.flags;
		const { datasetId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeDataset = await tryToGetDataset(apifyClient, datasetId);

		if (!maybeDataset) {
			error({ message: `Dataset with ID or name "${datasetId}" not found.` });

			return;
		}

		const { datasetClient } = maybeDataset;

		// Write something already to stdout when streaming to the terminal
		if (!output) {
			process.stdout.write('');
		}

		const result = await datasetClient.downloadItems(format, {
			limit,
			offset,
			clean,
			desc,
			fields: parseCsvList(fields),
			omit: parseCsvList(omit),
			unwind: parseCsvList(unwind),
		});

		const contentType = downloadFormatToContentType[format] ?? 'application/octet-stream';

		simpleLog({ message: contentType });

		if (output) {
			writeFileSync(output, result);
			return;
		}

		process.stdout.write(result);
		process.stdout.write('\n');
	}
}
