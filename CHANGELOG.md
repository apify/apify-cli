xxxxxxxxxxxxxxxxxx
==================
- Added command `apify vis` that validates actor input schema.

0.3.5 / 2018-01-25
==================
- Upgraded to apify@0.11 in templates

0.3.3 / 2018-12-12
==================
- Omitted CMD command in all templates Dockerfile.

0.3.2 / 2018-12-05
==================
- Updated apify-client package. It fixed bug, when user can not push actor, whe he changed version in apify.json.

0.3.1 / 2018-11-29
==================
- :tada: New commands to manage secret environment variables: `apify secrets:add`, `apify secrets:rm`.
- New documentation how to set environment variable in `apify.json`, see [documentation](https://github.com/apifytech/apify-cli/blob/master/README.md#environment-variables).
- **BREAKING CHANGES**: Simplified `apify.json` structure. It will be updated automatically before execution apify run and push command.
- Command `apify create` now shows progress bar of npm install.
- Small bugs fixes

0.2.7 / 2018-11-27
==================
- Updated all templates to latest apify packages

0.2.6 / 2018-11-09
==================
- Added warning if `apify run` reuse old state in storage
- Fixed issues #70 #65 #68

0.2.5 / 2018-10-31
==================
- Updated NPM dependencies
- Upgraded to apify-shared@0.1.6
- Fixed templates to use apify/actor-node-chrome Docker image instead of outdated apify/actor-node-puppeteer

0.2.3 / 2018-09-17
==================
- Updated all templates to apify version 0.8.*
- Added template named hello_word

0.2.1 / 2018-09-17
==================
- **BREAKING CHANGES**: The local storage directories have been renamed and package.json files needs a new `start` command.
  See [migration guide](/MIGRATIONS.md) for existing projects if you are upgrading from 0.1.* to 0.2.*.
- You can specified another file that main.js for `apify run` command using npm start script.

0.2.0 / 2018-09-12
==================
- **BREAKING CHANGES**: Version 0.2.0 of Apify CLI supports only version 0.7.0 of API SDK or newer as management of environment variables
  has been changed according to Apify SDK version 0.7.0.
- Dropped support for Node 7

0.1.18 / 2018-09-12
===================
- Updated NPM dependencies, npm-shrinkwrap.json replaced with package-lock.json
- Updated NPM dependencies in code templates

0.1.15 / 2018-07-23
===================
- Rename act to actor

0.1.13 / 2018-07-12
===================
- Add environment variables for enable live view for local actors.

0.1.12 / 2018-06-28
===================
- From now `apify call` and `apify push` commands stream live logs from run and build to your terminal
- Add options -p, --purge, --purge-dataset, --purge-key-value-store, --purge-queue in `apify run` to clean stores before runs actor locally
- Add option -w, --wait-for-finish=wait-for-finish in `apify push` and `apify call` - command waits x seconds to finish run or build on Apify
- Fixes #26, #33, #34, #36, #38, #39, #37, #35

0.1.11 / 2018-05-30
===================
- Use npm-shrinkwrap.json instead of package-lock.json for published module
- Update template, where we using proxy
- Fix #30

0.1.9 / 2018-04-18
==================
- apify run takes APIFY_USER_ID and APIFY_TOKEN as environments variables, if client is logged locally
- apify call takes input from default local key-value-store
- Fix: duplicates new lines in log

0.1.8 / 2018-04-17
==================
- Print warning if you have old version of cli
- apify run - kills all sub processes for SIGINT signal (ctrl+c) - It kills all related browsers in apify run command, related issue:
  https://github.com/apifytech/apify-js/issues/72

0.1.7 / 2018-04-12
==================
- Readme and templates updates

0.1.6 / 2018-04-11
==================
- Add support for request queue

0.1.5 / 2018-04-09
==================
- Works for windows
- New command apify info

0.1.x / 2018-04-01
==================
- The first public release

0.0.x / 2018-03-01
==================
- Initial development, lot of new stuff
