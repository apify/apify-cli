const { ApifyCommand } = require('../../lib/apify_command');
const { getApifyStorageClient, getDefaultStorageId, APIFY_STORE_TYPES } = require('../../lib/actor');

class PushDataCommand extends ApifyCommand {
    async init() {
        // Read data from stdin of the command
        this.stdin = await this.readStdin(process.stdin);
    }

    async run() {
        const { args } = this.parse(PushDataCommand);
        const { item } = args;

        const apifyClient = getApifyStorageClient();
        const defaultStoreId = getDefaultStorageId(APIFY_STORE_TYPES.DATASET);
        const data = item || this.stdin;
        let parsedData;
        try {
            parsedData = JSON.parse(data);
        } catch (err) {
            throw new Error(`Failed to parse data as JSON string: ${err.message}`);
        }
        const dataset = await apifyClient.datasets().getOrCreate(defaultStoreId);
        const datasetClient = apifyClient.dataset(dataset.id);
        await datasetClient.pushItems(parsedData);
    }
}

PushDataCommand.description = 'Stores an object or an array of objects to the default dataset of the actor run.' +
    + 'It is possible to pass data using item argument or stdin.\n'
    + 'Passing data using argument:\n'
    + '$ apify actor:push-data "{ \"foo\": \"bar\" }"\n'
    + 'Passing data using stdin with pipe:\n'
    + '$ cat ./test.json | apify actor:push-data\n';

PushDataCommand.args = [
    {
        name: 'item',
        required: false,
        description: 'JSON string with one object or array of objects containing data to be stored in the default dataset.',
    },
];

module.exports = PushDataCommand;
