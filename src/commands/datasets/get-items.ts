import { Args, Flags } from '@oclif/core';
import type { CustomOptions, FlagDefinition } from '@oclif/core/interfaces';
import { type ApifyClient, type Dataset, type DatasetClient, DownloadItemsFormat } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

const downloadFormatToContentType: Record<DownloadItemsFormat, string> = {
	[DownloadItemsFormat.JSON]: 'application/json',
	[DownloadItemsFormat.JSONL]: 'application/jsonl',
	[DownloadItemsFormat.CSV]: 'text/csv',
	[DownloadItemsFormat.HTML]: 'text/html',
	[DownloadItemsFormat.RSS]: 'application/rss+xml',
	[DownloadItemsFormat.XML]: 'application/xml',
	[DownloadItemsFormat.XLSX]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class DatasetsGetItems extends ApifyCommand<typeof DatasetsGetItems> {
	static override description = 'Exports the items present in a Dataset.';

	static override flags = {
		limit: Flags.integer({
			description:
				'The amount of elements to get from the dataset. By default, it will return all available items.',
		}),
		offset: Flags.integer({
			description: 'The offset in the dataset where to start getting items.',
		}),
		format:
			// This cast is used to turn the `format` field into a strictly typed value when using it in the run function,
			// giving it the DownloadItemsFormat type
			(
				Flags.string as FlagDefinition<
					DownloadItemsFormat,
					CustomOptions,
					{
						multiple: false;
						requiredOrDefaulted: false;
					}
				>
			)({
				description: "The format of the returned output. By default, it is set to 'json'",
				options: Object.keys(downloadFormatToContentType),
				default: DownloadItemsFormat.JSON,
			}),
	};

	static override args = {
		datasetId: Args.string({
			description: 'The ID of the Dataset to export the items for',
			required: true,
		}),
	};

	async run() {
		const { limit, offset, format } = this.flags;
		const { datasetId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeDataset = await this.tryToGetDataset(apifyClient, datasetId);

		if (!maybeDataset) {
			error({ message: `Dataset with ID "${datasetId}" not found.` });

			return;
		}

		const { datasetClient } = maybeDataset;

		const result = await datasetClient.downloadItems(format, {
			limit,
			offset,
		});

		const contentType = downloadFormatToContentType[format] ?? 'application/octet-stream';

		simpleLog({ message: contentType });

		process.stdout.write(result);
	}

	private async tryToGetDataset(
		client: ApifyClient,
		datasetId: string,
	): Promise<{ dataset: Dataset | undefined; datasetClient: DatasetClient } | null> {
		const byIdOrName = await client
			.dataset(datasetId)
			.get()
			.catch(() => undefined);

		if (byIdOrName) {
			return {
				dataset: byIdOrName,
				datasetClient: client.dataset(byIdOrName.id),
			};
		}

		const info = await getLocalUserInfo();

		const byName = await client
			.dataset(`${info.username!}/${datasetId}`)
			.get()
			.catch(() => undefined);

		if (byName) {
			return {
				dataset: byName,
				datasetClient: client.dataset(byName.id),
			};
		}

		return null;
	}
}
