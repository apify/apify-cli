import { Args, Flags } from '@oclif/core';
import type { CustomOptions, FlagDefinition } from '@oclif/core/interfaces';
import { type ApifyClient, type Dataset, type DatasetClient, DownloadItemsFormat } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

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
		format: (
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
			options: [
				DownloadItemsFormat.JSON,
				DownloadItemsFormat.JSONL,
				DownloadItemsFormat.XML,
				DownloadItemsFormat.HTML,
				DownloadItemsFormat.CSV,
				DownloadItemsFormat.XLSX,
				DownloadItemsFormat.RSS,
			] as const satisfies DownloadItemsFormat[],
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
			return;
		}

		const { datasetClient } = maybeDataset;

		const result = await datasetClient.downloadItems(format, {
			limit,
			offset,
		});

		let contentType: string;

		switch (format) {
			case DownloadItemsFormat.JSON: {
				contentType = 'application/json';
				break;
			}
			case DownloadItemsFormat.JSONL: {
				// Unofficial https://github.com/wardi/jsonlines/issues/19
				contentType = 'application/jsonl';
				break;
			}
			case DownloadItemsFormat.CSV: {
				contentType = 'text/csv';
				break;
			}
			case DownloadItemsFormat.HTML: {
				contentType = 'text/html';
				break;
			}
			case DownloadItemsFormat.RSS: {
				contentType = 'application/rss+xml';
				break;
			}
			case DownloadItemsFormat.XML: {
				// Per MDN, application/xml is recommended over text/xml.
				contentType = 'application/xml';
				break;
			}
			case DownloadItemsFormat.XLSX: {
				contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
				break;
			}
			default: {
				contentType = 'application/octet-stream';
			}
		}

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

		error({ message: `Dataset with ID "${datasetId}" not found.` });

		return null;
	}
}
