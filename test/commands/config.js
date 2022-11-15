const { ApifyClient } = require('apify-client');

const { TEST_USER_TOKEN } = process.env;
const TEST_USER_BAD_TOKEN = 'badToken';

if (!TEST_USER_TOKEN) {
    throw Error('You must configure "TEST_USER_TOKEN" environment variable to run tests!');
}

exports.testUserClient = new ApifyClient({
    token: TEST_USER_TOKEN,
    baseUrl: process.env.APIFY_CLIENT_BASE_URL,
});

exports.badUserClient = new ApifyClient({
    token: TEST_USER_BAD_TOKEN,
    baseUrl: process.env.APIFY_CLIENT_BASE_URL,
});

exports.TEST_USER_TOKEN = TEST_USER_TOKEN;
exports.TEST_USER_BAD_TOKEN = TEST_USER_BAD_TOKEN;
