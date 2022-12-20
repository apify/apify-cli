const { ApifyClient } = require('apify-client');
const { getApifyClientOptions } = require('../../src/lib/utils');

const { TEST_USER_TOKEN } = process.env;
const TEST_USER_BAD_TOKEN = 'badToken';

if (!TEST_USER_TOKEN) {
    throw Error('You must configure "TEST_USER_TOKEN" environment variable to run tests!');
}

exports.testUserClient = new ApifyClient(getApifyClientOptions(TEST_USER_TOKEN));

exports.badUserClient = new ApifyClient(getApifyClientOptions(TEST_USER_BAD_TOKEN));

exports.TEST_USER_TOKEN = TEST_USER_TOKEN;
exports.TEST_USER_BAD_TOKEN = TEST_USER_BAD_TOKEN;
