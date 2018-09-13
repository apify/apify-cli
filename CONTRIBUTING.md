# Contributing to apify-cli

## Tests

Tests are implemented using the [Mocha](https://mochajs.org/) framework.
You need to have Apify account to test all apify-cli features.

Then you can run tests with commands in repository root directory:

1. Install all dependencies:
`npm install`

2. Logout your current Apify account if you used some:
`apify logout`

3. Run tests:
`TEST_USER_ID=<apifyUserId> TEST_TOKEN=<apifyUserToken> npm run test`

## Publish new version

Only users with access to [apify-cli package](https://www.npmjs.com/package/apify-cli) can publish new version.

1. Generate `COMMANDS.md` and copy content to `README.md`:
`npm run commands_md`

2. Before publishing new version you have to generate and commit production `npm-shrinkwrap.json`
`npm run prod_shrinkwrap`
NOTE: File `package-lock.json` will be completely ignored during package publishing. Using `npm-shrinkwrap.json` we'll correctly lock dependencies.

3. Run publish script, which publish package to npm:
`./publish.sh`
