const ApifyClient = require('apify-client');

exports.testUserClient = new ApifyClient({
    userId: process.env.TEST_USER_ID,
    token: process.env.TEST_TOKEN,
});

exports.badUserClient = new ApifyClient({
    userId: 'badUserId',
    token: 'badToken',
});
