0.2.0 / 2018-09-12
==================
- WARNING: Version 0.2.0 of Apify CLI supports only version 0.7.0 of API SDK or newer as management of environment variables
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







