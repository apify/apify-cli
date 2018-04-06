# Apify command line client (apify-cli)

[![npm version](https://badge.fury.io/js/apify-cli.svg)](http://badge.fury.io/js/apify-cli)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-cli)

Apify command client client (CLI) helps you to create, develop, deploy and run
[Apify Actor](https://www.apify.com/docs/actor) acts from your local computer.

Apify Actor is a serverless computing platform that enables execution of arbitrary
web scraping and automation jobs in the cloud. A single job is called an _act_.

While you can develop the acts in a code editor directly in the [Apify web application](https://my.apify.com/),
for more complex projects it is convenient to develop the acts locally
and only push them to the Apify cloud for execution.
This is were the CLI comes in.

Note that the acts running on Apify Actor platform are executed in Docker containers, so with an appropriate `Dockerfile`
you can build your acts in any programming language.
However, we recommend using JavaScript / Node.js, for which we provide most libraries and support.


## Installation

First, make sure you have [Node.js](https://nodejs.org) version 7.10 or higher installed on your computer:

```bash
node --version
```

Install Apify CLI by running:

```bash
npm -g install apify-cli
```

Finally, you can test that the CLI was installed correctly:

```bash
apify info
```

## Basic usage

The following examples show basic usage of the CLI.

### Create a new act from scratch

```bash
apify create my_hello_world
```

First, you will be prompted to select a template with the boilerplate for the act, to help you get started quickly.
The command will create a directory called `my_hello_world` that contains a Node.js project
for the act and a few configuration files.

### Create a new act from existing project

```bash
cd ./my/awesome/project
apify init
```

This command will only create the `apify.json` file and `apify_local` directory in the current directory, but will not touch anything else.

### Run the act locally

```bash
cd my_hello_world
apify run
```

This command runs the act on your local machine.
Now it's your time to develop the logic (or magic?).

### Login with your Apify account

```bash
apify login
```

Before you can interact with the Apify cloud, you need to [create an Apify account](https://my.apify.com/)
and login to it using the above command. You will be prompted for
your [Apify API token](https://my.apify.com/account#/integrations).
Note that the command will store the API token and other sensitive information to `~/.apify`.


### Push the act to the Apify cloud

```bash
apify push
```

This command creates a ZIP archive with your project, uploads it to Apify cloud and builds an act from it.

### Runs an act on the Apify cloud

```bash
apify call
```

Runs the act corresponding to the current directory on the Apify Actor platform.

This command can be also used to run other acts, for example:

```bash
apify call apify/hello-world
```

###  Need help?

To see all CLI commands simply run:

```bash
apify help
```

To get information about a specific command run:

```bash
apify help COMMAND
```

Still haven't found what you were looking for? Please go to [Apify Help center](https://www.apify.com/help)
or [contact us](https://www.apify.com/contact).


## Command reference

This section contains printouts of `apify help` for all commands.

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
