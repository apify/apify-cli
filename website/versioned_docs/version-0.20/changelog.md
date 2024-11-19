---
title: Changelog
sidebar_label: Changelog
toc_max_heading_level: 2
---

## [v0.20.11](https://github.com/apify/apify-cli/releases/tag/v0.20.11)

#### What's Changed

- fix: scrapy wrapping being broken due to ESM migration ([#686](https://github.com/apify/apify-cli/pull/686)) by [@vladfrangu](https://github.com/vladfrangu)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.10...v0.20.11

## [v0.20.10](https://github.com/apify/apify-cli/releases/tag/v0.20.10)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.9...v0.20.10

## [v0.20.9](https://github.com/apify/apify-cli/releases/tag/v0.20.9)

#### What's Changed

- fix: emit warning if input.json is modified during run and prefilled with defaults ([#672](https://github.com/apify/apify-cli/pull/672)) by [@vladfrangu](https://github.com/vladfrangu)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.8...v0.20.9

## [v0.20.8](https://github.com/apify/apify-cli/releases/tag/v0.20.8)

#### What's Changed

- Reverted the empty namespaces that were added in the previous release
- fix: look for lowercase input schema in default paths ([#647](https://github.com/apify/apify-cli/pull/647)) by [@mvolfik](https://github.com/mvolfik)
- Increase the minimum Python version to 3.9, in line with Apify SDK

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.7...v0.20.8

## [v0.20.7](https://github.com/apify/apify-cli/releases/tag/v0.20.7)

#### What's Changed

- fix: auto-set `apify run` `INPUT.json` only with values that have defaults by [@vladfrangu](https://github.com/vladfrangu) in [#641](https://github.com/apify/apify-cli/pull/641)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.6...v0.20.7

## [v0.20.6](https://github.com/apify/apify-cli/releases/tag/v0.20.6)

#### What's Changed

- fix: ensure input kvs path exists when calling `apify run` by [@vladfrangu](https://github.com/vladfrangu) in [#625](https://github.com/apify/apify-cli/pull/625)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.5...v0.20.6

## [v0.20.5](https://github.com/apify/apify-cli/releases/tag/v0.20.5)

#### What's Changed

- fix: print path to invalid `actor.json` when an invalid file is found by [@vladfrangu](https://github.com/vladfrangu) in [#618](https://github.com/apify/apify-cli/pull/618)
- fix: passing the item via stdin to `actor push-data` works again by [@vladfrangu](https://github.com/vladfrangu) in [#617](https://github.com/apify/apify-cli/pull/617)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.4...v0.20.5

## [v0.20.4](https://github.com/apify/apify-cli/releases/tag/v0.20.4)

#### What's Changed

- feat: printing dataset result for `call` command by [@vladfrangu](https://github.com/vladfrangu) in [#614](https://github.com/apify/apify-cli/pull/614)

#### New Contributors

- @netmilk made their first contribution in [#609](https://github.com/apify/apify-cli/pull/609)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.3...v0.20.4

## [v0.20.3](https://github.com/apify/apify-cli/releases/tag/v0.20.3)

#### What's Changed

- fix(call): support calling with bare ids by [@vladfrangu](https://github.com/vladfrangu) in [#613](https://github.com/apify/apify-cli/pull/613)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.2...v0.20.3

## [v0.20.2](https://github.com/apify/apify-cli/releases/tag/v0.20.2)

#### What's Changed

- fix: run scripts not printing unsupported node versions rightly by [@vladfrangu](https://github.com/vladfrangu) in [#589](https://github.com/apify/apify-cli/pull/589)
- fix: run command validating inputs caused inputs to not work in crawlee projects by [@vladfrangu](https://github.com/vladfrangu) in [#591](https://github.com/apify/apify-cli/pull/591)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.20.0...v0.20.2

## [](https://github.com/apify/apify-cli/releases/tag/v0.20.0)

#### What's Changed

- feat: add a troubleshooting section to the root help screen by [@tobice](https://github.com/tobice) in [#491](https://github.com/apify/apify-cli/pull/491)
- feat: Better copy and docs by [@jancurn](https://github.com/jancurn) in [#494](https://github.com/apify/apify-cli/pull/494)
- fix: prompt for new folder name when existing folder is used with `apify create` by [@vladfrangu](https://github.com/vladfrangu) in [#504](https://github.com/apify/apify-cli/pull/504)
- feat: Warn user there's newer Actor version on the platform by [@HonzaTuron](https://github.com/HonzaTuron) in [#506](https://github.com/apify/apify-cli/pull/506)
- feat: use login-new as default login method by [@HonzaTuron](https://github.com/HonzaTuron) in [#508](https://github.com/apify/apify-cli/pull/508)
- feat: support spaces and `:` for subcommands by [@vladfrangu](https://github.com/vladfrangu) in [#521](https://github.com/apify/apify-cli/pull/521)
- feat: prevent old node from running CLI by [@vladfrangu](https://github.com/vladfrangu) in [#522](https://github.com/apify/apify-cli/pull/522)
- feat: different exit codes for different errors by [@vladfrangu](https://github.com/vladfrangu) in [#520](https://github.com/apify/apify-cli/pull/520)
- feat: --no-optional for create command by [@vladfrangu](https://github.com/vladfrangu) in [#524](https://github.com/apify/apify-cli/pull/524)
- feat: support calling actors with bare names by [@vladfrangu](https://github.com/vladfrangu) in [#538](https://github.com/apify/apify-cli/pull/538)
- feat: support running other entrypoints with injected Apify environment variables by [@vladfrangu](https://github.com/vladfrangu) in [#539](https://github.com/apify/apify-cli/pull/539)
- fix: always enable crawlee storage purging when `--purge` is provided, even in non-crawlee-detected envs by [@vladfrangu](https://github.com/vladfrangu) in [#543](https://github.com/apify/apify-cli/pull/543)
- feat: Setup Smartlook for CLI docs by [@HonzaTuron](https://github.com/HonzaTuron) in [#544](https://github.com/apify/apify-cli/pull/544)
- fix: prevent running `apify push` from non-actor-looking folders by [@vladfrangu](https://github.com/vladfrangu) in [#537](https://github.com/apify/apify-cli/pull/537)
- fix: purge working in python again by [@vladfrangu](https://github.com/vladfrangu) in [#548](https://github.com/apify/apify-cli/pull/548)
- fix: deprecate `vis` command in favor of `validate-schema` by [@vladfrangu](https://github.com/vladfrangu) in [#556](https://github.com/apify/apify-cli/pull/556)
- fix: always try to get a remote storage if IS_AT_HOME is true by [@vladfrangu](https://github.com/vladfrangu) in [#557](https://github.com/apify/apify-cli/pull/557)
- feat: task run, actor call, deprecate top level call by [@vladfrangu](https://github.com/vladfrangu) in [#558](https://github.com/apify/apify-cli/pull/558)
- fix: print most information to stderr in preparation of future integrations by [@vladfrangu](https://github.com/vladfrangu) in [#570](https://github.com/apify/apify-cli/pull/570)
- feat: Update api token links by [@valekjo](https://github.com/valekjo) in [#578](https://github.com/apify/apify-cli/pull/578)
- feat: validate input on run by [@vladfrangu](https://github.com/vladfrangu) in [#560](https://github.com/apify/apify-cli/pull/560)
- feat: call with inputs by [@vladfrangu](https://github.com/vladfrangu) in [#577](https://github.com/apify/apify-cli/pull/577)
- chore: migrate to TypeScript and Oclif 3 by [@vladfrangu](https://github.com/vladfrangu) in [#477](https://github.com/apify/apify-cli/pull/477)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.5...v0.20.0

## [v0.19.5](https://github.com/apify/apify-cli/releases/tag/v0.19.5)

#### What's Changed

- fix: CLI on Windows throwing EINVAL errors with latest node 18/20/22 by [@vladfrangu](https://github.com/vladfrangu)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.4...v0.19.5

## [v0.19.4](https://github.com/apify/apify-cli/releases/tag/v0.19.4)

#### What's Changed

- fix: make `run --purge` work again for Python projects by [@vladfrangu](https://github.com/vladfrangu)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.3...v0.19.4

## [](https://github.com/apify/apify-cli/releases/tag/v0.19.3)

#### What's Changed

- fix: always enable crawlee storage purging when `--purge` is provided even in non-crawlee-detected envs by [@vladfrangu](https://github.com/vladfrangu)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.2...v0.19.3

## [v0.19.2](https://github.com/apify/apify-cli/releases/tag/v0.19.2)

#### What's Changed

- feat: validate the Actor name during init by [@barjin](https://github.com/barjin) in [#450](https://github.com/apify/apify-cli/pull/450)
- feat: extend success command on create by [@HonzaTuron](https://github.com/HonzaTuron) in [#466](https://github.com/apify/apify-cli/pull/466)
- fix: axios v1 and new client breaking cli by [@vladfrangu](https://github.com/vladfrangu) in [#481](https://github.com/apify/apify-cli/pull/481)

#### New Contributors

- @vdusek made their first contribution in [#439](https://github.com/apify/apify-cli/pull/439)
- @TC-MO made their first contribution in [#468](https://github.com/apify/apify-cli/pull/468)
- @honzajavorek made their first contribution in [#472](https://github.com/apify/apify-cli/pull/472)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.1...v0.19.2

## [v0.19.1](https://github.com/apify/apify-cli/releases/tag/v0.19.1)

#### What's Changed

- fix: restore fallback behaviour for `apify run` in Scrapy projects by [@barjin](https://github.com/barjin) in [#437](https://github.com/apify/apify-cli/pull/437)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.19.0...v0.19.1

## [v0.19.0](https://github.com/apify/apify-cli/releases/tag/v0.19.0)

#### What's Changed

- feat: Auto-update `apify-cli` Homebrew formula in `homebrew-core` by [@fnesveda](https://github.com/fnesveda) in [#387](https://github.com/apify/apify-cli/pull/387)
- fix: spelling in helpers by [@barjin](https://github.com/barjin) in [#389](https://github.com/apify/apify-cli/pull/389)
- feat: `apify init` wraps Scrapy projects with Apify middleware by [@barjin](https://github.com/barjin) in [#393](https://github.com/apify/apify-cli/pull/393)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.18.1...v0.19.0

## [v0.18.1](https://github.com/apify/apify-cli/releases/tag/v0.18.1)

#### What's Changed

##### Fixes

- Fixed `actor:push-data` and `actor:set-value` commands by [@drobnikj](https://github.com/drobnikj) in [#386](https://github.com/apify/apify-cli/pull/386)

##### Documentation changes

- Updated Homebrew installation instructions by [@fnesveda](https://github.com/fnesveda) in [#385](https://github.com/apify/apify-cli/pull/385)
- Minor rewording by [@jancurn](https://github.com/jancurn) in [#383](https://github.com/apify/apify-cli/pull/383)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.18.0...v0.18.1

## [v0.18.0](https://github.com/apify/apify-cli/releases/tag/v0.18.0)

#### What's Changed

- feat(create, init): create INPUT.json from input_schema prefills by [@nguyeda1](https://github.com/nguyeda1) in [#379](https://github.com/apify/apify-cli/pull/379)
- feat: Use actor/apify env vars instead of old `ENV_VARS` by [@jirimoravcik](https://github.com/jirimoravcik) in [#381](https://github.com/apify/apify-cli/pull/381)
- chore: Bump version to 0.18.0 by [@jirimoravcik](https://github.com/jirimoravcik) in [#382](https://github.com/apify/apify-cli/pull/382)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.17.0...v0.18.0

## [v0.17.0](https://github.com/apify/apify-cli/releases/tag/v0.17.0)

#### What's Changed

- BREAKING CHANGE: Telemetry data collection by [@drobnikj](https://github.com/drobnikj) in [#362](https://github.com/apify/apify-cli/pull/362)
- chore: Fix docs reference by [@drobnikj](https://github.com/drobnikj) in [#375](https://github.com/apify/apify-cli/pull/375)
- fix: Folder path creation by [@HonzaTuron](https://github.com/HonzaTuron) in [#376](https://github.com/apify/apify-cli/pull/376)
- feat(create): Merge local development instructions into README by [@nguyeda1](https://github.com/nguyeda1) in [#372](https://github.com/apify/apify-cli/pull/372)

#### New Contributors

- @nguyeda1 made their first contribution in [#372](https://github.com/apify/apify-cli/pull/372)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.16.2...v0.17.0

## [v0.16.2](https://github.com/apify/apify-cli/releases/tag/v0.16.2)

#### What's Changed

- chore: Use new workflow secrets by [@fnesveda](https://github.com/fnesveda) in [#361](https://github.com/apify/apify-cli/pull/361)
- feat: Add community message by [@HonzaTuron](https://github.com/HonzaTuron) in [#363](https://github.com/apify/apify-cli/pull/363)
- fix: Use the right exit code on error by [@fnesveda](https://github.com/fnesveda) in [#364](https://github.com/apify/apify-cli/pull/364)
- feat(push): Allow disabling of the prompt mechanism via flag/CI by [@vladfrangu](https://github.com/vladfrangu) in [#365](https://github.com/apify/apify-cli/pull/365)
- fix(push): Correctly check if in CI env to skip prompt by [@vladfrangu](https://github.com/vladfrangu) in [#366](https://github.com/apify/apify-cli/pull/366)
- fix: Fix unit tests by [@fnesveda](https://github.com/fnesveda) in [#371](https://github.com/apify/apify-cli/pull/371)
- feat(app): Add apify pull by [@HonzaTuron](https://github.com/HonzaTuron) in [#360](https://github.com/apify/apify-cli/pull/360)

#### New Contributors

- @vladfrangu made their first contribution in [#365](https://github.com/apify/apify-cli/pull/365)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.16.1...v0.16.2

## [v0.16.1](https://github.com/apify/apify-cli/releases/tag/v0.16.1)

#### What's Changed

- Fix `apify create` on Node 19+, add Node 20 to CI test roster by [@fnesveda](https://github.com/fnesveda) in [#359](https://github.com/apify/apify-cli/pull/359)

## [v0.16.0](https://github.com/apify/apify-cli/releases/tag/v0.16.0)

#### What's Changed

##### New features

- Added option to open actor detail in Apify Console after successful `apify push` by [@HonzaTuron](https://github.com/HonzaTuron) in [#353](https://github.com/apify/apify-cli/pull/353)

##### Fixes

- Stopped adding `apify_storage` to .gitignore if it already is there by [@fnesveda](https://github.com/fnesveda) in [#355](https://github.com/apify/apify-cli/pull/355)
- Fixed extracting some template archives by [@mvolfik](https://github.com/mvolfik) in [#358](https://github.com/apify/apify-cli/pull/358)
- Improved log messages for different build statuses by [@fnesveda](https://github.com/fnesveda) in [#350](https://github.com/apify/apify-cli/pull/350)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.15.1...v0.16.0

## [v0.15.1](https://github.com/apify/apify-cli/releases/tag/v0.15.1)

#### What's Changed

- Added a post-create message to Python actors by [@fnesveda](https://github.com/fnesveda) in [#349](https://github.com/apify/apify-cli/pull/349)
- Updated the `apify run` help to not be so Node-specific by [@fnesveda](https://github.com/fnesveda) in [#347](https://github.com/apify/apify-cli/pull/347)
- Started using correct "omit optional dependencies" argument based on NPM version by [@fnesveda](https://github.com/fnesveda) in [#346](https://github.com/apify/apify-cli/pull/346)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.15.0...v0.15.1

## [v0.15.0](https://github.com/apify/apify-cli/releases/tag/v0.15.0)

#### New features

- Apify Console login integration in `apify login-new` by [@fnesveda](https://github.com/fnesveda) in [#302](https://github.com/apify/apify-cli/pull/302)
- Preparations for release on Homebrew by [@fnesveda](https://github.com/fnesveda) in [#341](https://github.com/apify/apify-cli/pull/341), [#342](https://github.com/apify/apify-cli/pull/342), [#343](https://github.com/apify/apify-cli/pull/343) and [#345](https://github.com/apify/apify-cli/pull/345)
- Better template language selection in `apify create` by [@mnmkng](https://github.com/mnmkng) in [#338](https://github.com/apify/apify-cli/pull/338)
- New documentation portal by [@barjin](https://github.com/barjin) in [#331](https://github.com/apify/apify-cli/pull/331)

#### Internal changes

- Added automated tests for Python support by [@fnesveda](https://github.com/fnesveda) in [#344](https://github.com/apify/apify-cli/pull/344)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.14.1...v0.15.0

## [v0.14.1](https://github.com/apify/apify-cli/releases/tag/v0.14.1)

#### What's Changed

- chore: Disable actor template prompt looping around by [@fnesveda](https://github.com/fnesveda) in [#318](https://github.com/apify/apify-cli/pull/318)
- feat: Support for running Python actors by [@fnesveda](https://github.com/fnesveda) in [#316](https://github.com/apify/apify-cli/pull/316)
- fix: Removing unneeded dependencies by [@mtrunkat](https://github.com/mtrunkat) in [#322](https://github.com/apify/apify-cli/pull/322)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.13.0...v0.14.1

## [v0.13.0](https://github.com/apify/apify-cli/releases/tag/v0.13.0)

#### What's Changed

- feat: Making outdated version warning more visible by [@mtrunkat](https://github.com/mtrunkat) in [#301](https://github.com/apify/apify-cli/pull/301)
- fix: fix headings in readme by [@mhamas](https://github.com/mhamas) in [#308](https://github.com/apify/apify-cli/pull/308)
- fix: Update node version by [@novotnyj](https://github.com/novotnyj) in [#314](https://github.com/apify/apify-cli/pull/314)
- fix: missing latest tag on first push by [@mnmkng](https://github.com/mnmkng) in [#312](https://github.com/apify/apify-cli/pull/312)

**Full Changelog**: https://github.com/apify/apify-cli/compare/v0.12.0...v0.13.0

## [v0.12.0](https://github.com/apify/apify-cli/releases/tag/v0.12.0)

- add the `X-Apify-Request-Origin: CLI` header to the API calls done by CLI

## [v0.11.1](https://github.com/apify/apify-cli/releases/tag/v0.11.1)

- Fix `create` command which rewrites `.actor/actor.json` from template with default file

## [v0.11.0](https://github.com/apify/apify-cli/releases/tag/v0.11.0)

- modify commands to work with actor config stored in `.actor/actor.json` instead of the deprecated `apify.json`
- add migration from the deprecated config to the new one
- modify `vis` and `edit-input-schema` commands to find the input schema at the correct location, where it would be loaded from on the platform
- update README and commands' help texts to cover these changes
