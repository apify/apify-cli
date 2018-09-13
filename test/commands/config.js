const ApifyClient = require('apify-client');

const { TEST_USER_ID, TEST_TOKEN } = process.env;

if (!TEST_USER_ID || !TEST_TOKEN) {
    throw Error('You must configure "TEST_USER_ID" and "TEST_TOKEN" environment variables to run tests!');
}

exports.testUserClient = new ApifyClient({
    userId: TEST_USER_ID,
    token: TEST_TOKEN,
});

exports.badUserClient = new ApifyClient({
    userId: 'badUserId',
    token: 'badToken',
});
