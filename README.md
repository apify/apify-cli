# Apify command line client (apify-cli)

[![npm version](https://badge.fury.io/js/apify-cli.svg)](http://badge.fury.io/js/apify-cli)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-cli)

Apify command client client (CLI) helps you to create, develop and deploy
[Apify Actor](https://www.apify.com/docs/actor) acts from your local computer.


## Installation

1) Install [Node.js](https://nodejs.org) version 7.10 or higher to your computer.

2) Install Apify CLI with:

```bash
npm -g install apify-cli
```

3) Test everything was installed correctly by running:

```bash
apify info
```

## Usage


To start developing Apify Actor acts locally, first you need to create an act.

### 1) Create a new act called `hello_world`:

```bash
apify create hello_world
```

You will be prompted to select a template for the act, to help you get started quickly.
After that, the tool will create a directory `hello_world` that contains a Node.js project
for the act.

### 2) Run the act locally

Go to the newly created directory:

```bash
cd hello_world
```
And run the act:

```bash
apify run
```

###  3) Push the act to Apify cloud

LOGIN...

###  4) Call the act running on Apify cloud




## Command reference
<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->

```
Command line client for Apify.

VERSION
  apify-cli/0.1.0 darwin-x64 node-v8.9.4

USAGE
  $ apify [COMMAND]

COMMANDS
  call
  create
  init
  login
  logout
  push
  run

```
### apify call
<pre><code>
USAGE
  $ apify call [ACTID]

ARGUMENTS
  ACTID  Act ID of calling act. It overrides actId in apify.json.

OPTIONS
  -b, --build=build      Tag or number of the build to run (e.g. latest or
                         1.2.34).

  -m, --memory=memory    Amount of memory allocated for the act run, in
                         megabytes.

  -t, --timeout=timeout  Timeout for the act run in seconds. Zero value means
                         there is no timeout.

DESCRIPTION
  This runs your act on Apify and fetches results from output.


</code></pre>
### apify create
```
USAGE
  $ apify create ACTNAME

ARGUMENTS
  ACTNAME  Name of creating act

OPTIONS
  -t, --template=basic|puppeteer|puppeteer_crawler|plain_request_urls_list
      Act template, if not pass it'll prompt from the console.

DESCRIPTION
  This creates directory with proper structure for local development.
  NOTE: You can specified act template, which can help you in specific use cases
  like crawling urls list or crawling with queue.


```
### apify init
```
USAGE
  $ apify init [ACTNAME]

ARGUMENTS
  ACTNAME  Name of initeled act

DESCRIPTION
  This asks you for your the act name, writes apify.json and creates apify_local
  folder structure for local development.
  NOTE: This overrides your current apify.json.


```
### apify login
```
USAGE
  $ apify login

OPTIONS
  -t, --token=token  [Optional] Your API token on Apify

DESCRIPTION
  This is an interactive prompt which authenticates you with Apify.
  All tokens and keys will store ~/.apify.
  NOTE: If you set up token options, prompt will skip

```
### apify logout
```
USAGE
  $ apify logout

DESCRIPTION
  Deletes all your stored tokens and keys from ~/.apify.
  NOTE: This deletes all your global settings.


```
### apify push
```
USAGE
  $ apify push [ACTID]

ARGUMENTS
  ACTID  Act ID of pushing act. It overrides actId in apify.json.

OPTIONS
  -b, --build-tag=build-tag            Build tag of pushing act version.
  -v, --version-number=version-number  Version number of pushing act version.

DESCRIPTION
  This uploads act from the current directory to Apify and builds it.
  If exists apify.json in the directory it takes options from there. You can
  override these with options below.
  NOTE: Act overrides current act with the same version on Apify.


```
### apify run
```
USAGE
  $ apify run

DESCRIPTION
  This runs act from current directory. It uses apify_local for getting input
  and setting output and storing data.


```
