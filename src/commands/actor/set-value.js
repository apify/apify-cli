const { flags: flagsHelper } = require('@oclif/command');
const { ApifyCommand } = require('../../lib/apify_command');
const { getApifyStorageClient, getDefaultStorageId, APIFY_STORAGE_TYPES } = require('../../lib/actor');

class SetValueCommand extends ApifyCommand {
    async init() {
        // Read data from stdin of the command
        this.stdin = await this.readStdin(process.stdin);
    }

    async run() {
        const { args, flags } = this.parse(SetValueCommand);
        const { stdin } = this;
        const { key, value } = args;
        const { contentType = 'application/json; charset=utf-8' } = flags;

        // NOTE: If user pass value as argument and data on stdin same time. We use the value from argument.
        const recordValue = value || stdin;
        const apifyClient = await getApifyStorageClient();
        const storeClient = apifyClient.keyValueStore(getDefaultStorageId(APIFY_STORAGE_TYPES.KEY_VALUE_STORE));
        if (recordValue === undefined || recordValue === null) {
            await storeClient.deleteRecord(key);
        } else {
            await storeClient.setRecord({ key, value: recordValue, contentType });
        }
    }
}

SetValueCommand.description = 'Sets or removes record into the default KeyValueStore associated with the actor run.\n'
    + 'It is possible to pass data using argument or stdin.\n'
    + 'Passing data using argument:\n'
    + '$ apify actor:set-value KEY my-value\n'
    + 'Passing data using stdin with pipe:\n'
    + '$ cat ./my-text-file.txt | apify actor:set-value KEY --contentType text/plain\n';

SetValueCommand.args = [
    {
        name: 'key',
        required: true,
        description: 'Key of the record in key-value store.',
    },
    {
        // TODO: It can be path of the file where value is store. We can add it in the next version.
        name: 'value',
        required: false,
        description: 'Record data, which can be one of the following values:\n'
            + '- If empty, the record in the key-value store is deleted.\n'
            + '- If no `contentType` flag is specified, value is expected to be any JSON string value.\n'
            + '- If options.contentType is set, value is taken as is.',
    },
];

SetValueCommand.flags = {
    contentType: flagsHelper.string({
        char: 'c',
        description: 'Specifies a custom MIME content type of the record. By default "application/json" is used.',
        required: false,
    }),
};

module.exports = SetValueCommand;
