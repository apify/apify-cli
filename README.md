# Apify command line client (apify-cli)

[![npm version](https://badge.fury.io/js/apify-cli.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-cli)

Apify command client helps you to create and deploy [Apify Actor acts](https://www.apify.com/docs/actor).


## Usage

To get started with Apify command line client, first make sure you have Node.js (`v7.10.x` and higher) installed.

Then install Apify CLI with:

`npm -g install apify-cli`

## Commands

### apify help [COMMAND]
This prints help for specified command.

- **Arguments**

| Argument         |Required | Example value   |  Description  |
| :---------------:|:-------:|:---------------:| :------------ |
| COMMAND  |         | init | The command for which help will be print. |


### apify login
This is an interactive prompt which authenticates you with Apify. All tokens and keys will store ~/.apify.
NOTE: If you set up token options, prompt will skip

- **Options**

| Option         |Required | Example value   |  Description  |
| :--------------|:-------:|:---------------:| :------------ |
| -t, --token    |         | 6g5Nfz9zHt7k9Ub | Your API token on Apify. You can find it on you [Apify accout](https://my.apify.com/account#/integrations). |


### apify logout
Deletes all your stored tokens and keys from ~/.apify.
NOTE: This deletes all your global settings.


### apify call [ACTID]
This runs your act on Apify and fetches results from output.

- **Arguments**

| Argument         |Required | Example value   |  Description  |
| :----------------|:-------:|:---------------:| :------------ |
| ACTID            |         | 9h6Gfd87jg6ZGsb | Act ID of calling act. It overrides actId in apify.json. |

- **Options**

| Option               |Required | Example value   |  Description  |
| :--------------------|:-------:|:---------------:| :------------ |
| -b, --build          |         | 1.2.3           | Tag or number of the build to run (e.g. latest or 1.2.34). |
| -m, --memory         |         | 1024            | Amount of memory allocated for the act run, in megabytes. |
| -t, --timeout        |         | 300             | Timeout for the act run in seconds. Zero value means there is no timeout. |


### apify create ACTNAME
This creates directory with proper structure for local development.

- **Arguments**

| Argument         |Required | Example value   |  Description  |
| :----------------|:-------:|:---------------:| :------------ |
| ACTNAME          |    *    | my-act-name     | Act name of act you want to create. |

- **Options**

| Option         |Required | Example value   |  Description  |
| :--------------|:-------:|:---------------:| :------------ |
| -t, --template |         | basic           | Act template, if not pass it'll prompt from the console. |


### apify init [ACTNAME]
This asks you for your the act name, writes `apify.json` and creates `apify_local` folder structure for local development.

- **Arguments**

| Argument         |Required | Example value   |  Description  |
| :----------------|:-------:|:---------------:| :------------ |
| ACTNAME          |         | my-act-name     | Act name of act you want to init. If not set it will prompt. |


### apify push [ACTID]
This uploads act from the current directory to Apify and builds it.
If exists apify.json in the directory it takes options from there. You can override these with options below.

- **Arguments**

| Argument         |Required | Example value   |  Description  |
| :----------------|:-------:|:---------------:| :------------ |
| ACTID            |         | 9h6Gfd87jg6ZGsb | Act ID of act you want to push. It overrides actId in `apify.json`. |

- **Options**

| Option               |Required | Example value   |  Description  |
| :--------------------|:-------:|:---------------:| :------------ |
| -b, --build-tag      |         | latest          | Build tag of pushing act version. |
| -v, --version-number |         | 0.1             | Version number of pushing act version. |


### apify run
This runs act from current directory. It uses `apify_local` for getting input and setting output and storing data.


### apify --version
This prints version of your command line client.
