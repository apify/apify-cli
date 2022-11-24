# Contributing to apify-cli

## Tests

Tests are implemented using the [Mocha](https://mochajs.org/) framework.
You need to have Apify account to test all apify-cli features.

Then you can run tests with commands in repository root directory:

1. Install all dependencies:
`npm install`

2. Logout your current Apify account if you used some:
`apify logout`

3. Run tests using credentials of the 'apify-test' user:
`TEST_USER_TOKEN=<apifyUserApiToken> npm run test`

## Publish new version

Only users with access to [apify-cli package](https://www.npmjs.com/package/apify-cli) can publish new version.

Release of new versions is managed by GitHub Actions. On pushes to the master branch, prerelease versions are automatically produced. Latest releases are triggered manually through the GitHub release tool. After creating a release there, Actions will automatically produce the latest version of the package.

1. Manually increment version in `package.json`

2. Create manifest file `npm run manifest`

3. Generate command reference to `README.md`:
`npm run commands-md`

4. Before publishing new version you have to generate and commit production `npm-shrinkwrap.json`
`npm run prod-shrinkwrap`
NOTE: File `package-lock.json` will be completely ignored during package publishing. Using `npm-shrinkwrap.json` will correctly lock dependencies.

5. GitHub Actions build is triggered by a push to `master` (typically a merge of a PR).

6. To trigger the latest release, go to the GitHub release tool (select `releases` under `<> Code`). There, draft a new release, fill the form and hit `Publish release`. Actions will automatically release the latest version of the package.
