import { APIFY_STORAGE_TYPES, getApifyStorageClient, getDefaultStorageId } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';

export class ActorSetValueCommand extends ApifyCommand<typeof ActorSetValueCommand> {
	static override name = 'set-value' as const;

	static override description =
		'Sets or removes record into the default key-value store associated with the Actor run.\n\n' +
		'It is possible to pass data using argument or stdin.\n\n' +
		'Passing data using argument:\n' +
		'$ apify actor set-value KEY my-value\n\n' +
		'Passing data using stdin with pipe:\n' +
		'$ cat ./my-text-file.txt | apify actor set-value KEY --contentType text/plain';

	static override args = {
		key: Args.string({
			required: true,
			description: 'Key of the record in key-value store.',
		}),
		value: Args.string({
			required: false,
			description:
				'Record data, which can be one of the following values:\n' +
				'- If empty, the record in the key-value store is deleted.\n' +
				'- If no `contentType` flag is specified, value is expected to be any JSON string value.\n' +
				'- If options.contentType is set, value is taken as is.',
		}),
	};

	static override flags = {
		contentType: Flags.string({
			char: 'c',
			description: 'Specifies a custom MIME content type of the record. By default "application/json" is used.',
			required: false,
		}),
	};

	async run() {
		const { key, value } = this.args;
		const { contentType = 'application/json; charset=utf-8' } = this.flags;

		// NOTE: If user pass value as argument and data on stdin same time. We use the value from argument.
		const recordValue = value || process.stdin;
		const apifyClient = await getApifyStorageClient();
		const storeClient = apifyClient.keyValueStore(getDefaultStorageId(APIFY_STORAGE_TYPES.KEY_VALUE_STORE));

		if (
			recordValue === undefined ||
			recordValue === null ||
			recordValue === '' ||
			recordValue === 'null' ||
			recordValue === 'undefined'
		) {
			await storeClient.deleteRecord(key);
		} else {
			await storeClient.setRecord({ key, value: recordValue, contentType });
		}
	}
}
