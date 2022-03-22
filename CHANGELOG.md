**Changelog file is no longer maintained, you can check all changes in [GitHub Releases](https://github.com/apify/apify-cli/releases).**

0.6.1 / 2020-05-18
==================
- **BREAKING:** Templates are now fully decoupled from this project and
  the [templates repository](https://github.com/apify/actor-templates)
  serves as the single source of truth. Some templates were replaced
  and others were renamed to better clarify their purpose.
- **BREAKING:** Providing an invalid template in `apify.json` no longer
  throws, but rather silently uses a reasonable default configuration.
  This is to support regular changes to templates without breaking older
  versions of the CLI.

0.5.3 / 2020-03-03
==================
- Moved templates to separate repository
- Fixed: creating `apify_storage` in root folder after `apify create` command

0.5.2 / 2020-01-22
==================
- Added bot(dependabot.com) to check latest Apify SDK version in all templates
- Updated apify package in all templates
- Updated npm packages and fixed all npm audit issues

0.5.1 / 2019-12-19
==================
- Added warning about outdated node.js version
- Fixed infinite push, when the previous one was interrupted
- Fixed calling public actors with `apify call`
- `apify init` create empty INPUT.json file

0.5.0 / 2019-11-27
==================
- Drop support for node 8 and 9
- Fix: Pass the --max-http-header-size=80000 to the nodeJs process

0.4.1 / 2019-10-02
==================
- New actor template for Apify projects, you can create it with `apify create --template apify_project`
- `apify vis` - Using improved schema validator

0.4.0 / 2019-09-23
==================
- Breaking Change - `apify push`: Pushes source code as a "Multiple source files" in case source code is less that 3 MB

0.3.12 / 2019-09-18
==================
Bug fixes:
- `apify create`: Added validation for actor name
- `apify init` skips creation of apify.json if already exists
- `apify run -p` runs actor, if apify_storage doesn't exist
- Updated packages
- Additional minor fixes

0.3.11 / 2019-07-26
==================
- Updated packages
- Updated Cheerio Crawler template
- Updated Apify package version in all templates

0.3.10 / 2019-06-03
==================
- Updated packages

0.3.9 / 2019-05-15
==================
- Improved the templates and texts

0.3.8 / 2019-03-29
==================
- Updated all templates regarding the last version of apify SDK.

0.3.7 / 2019-03-18
==================
- Fixed templates to use Apify.getInput(), replaced deprecated function and options,
added debug fields, added .idea to .gitignore
- Updated packages
- Fixed bug: Users without username can use push/call command

0.3.6 / 2019-01-29
==================
- Added command `apify vis` that validates actor input schema.

0.3.5 / 2019-01-25
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
- New documentation how to set environment variable in `apify.json`, see [documentation](https://github.com/apify/apify-cli/blob/master/README.md#environment-variables).
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
  https://github.com/apify/apify-js/issues/72

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







