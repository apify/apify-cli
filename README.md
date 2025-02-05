# Apify command-line interface (Apify CLI)

<a href="https://www.npmjs.com/package/apify-cli"><img src="https://badge.fury.io/js/apify-cli.svg" alt="npm version" loading="lazy" style="display:inherit;" /></a>
<a href="https://travis-ci.com/apify/apify-cli?branch=master"><img src="https://travis-ci.com/apify/apify-cli.svg?branch=master" loading="lazy" alt="Build Status" style="display:inherit;" /></a>

Apify command-line interface (Apify CLI) helps you create, develop, build and run
[Apify Actors](https://www.apify.com/actors),
and manage the Apify cloud platform from any computer.

Apify Actors are cloud programs that can perform arbitrary web scraping, automation or data processing job.
They accept input, perform their job and generate output.
While you can develop Actors in an online IDE directly in the [Apify web application](https://console.apify.com/),
for complex projects it is more convenient to develop Actors locally on your computer
using <a href="https://github.com/apify/apify-sdk-js">Apify SDK</a>
and only push the Actors to the Apify cloud during deployment.
This is where the Apify CLI comes in.

Note that Actors running on the Apify platform are executed in Docker containers, so with an appropriate `Dockerfile`
you can build your Actors in any programming language.
However, we recommend using JavaScript / Node.js, for which we provide most libraries and support.

## Installation

### Via Homebrew

On macOS (or Linux), you can install the Apify CLI via the [Homebrew package manager](https://brew.sh).

```bash
brew install apify-cli
```

### Via NPM

First, make sure you have [Node.js](https://nodejs.org) version 16 or higher with NPM installed on your computer:

```bash
node --version
npm --version
```

Install or upgrade Apify CLI by running:

```bash
npm -g install apify-cli
```

If you receive an `EACCES` error, you might need to run the command as root:

```bash
sudo npm -g install apify-cli
```

Alternatively, you can use [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) and install Apify CLI only into a selected user-level Node version without requiring root privileges:

```
nvm install 16
nvm use 16
npm -g install apify-cli
```

Finally, verify that Apify CLI was installed correctly by running:

```bash
apify --version
```

which should print something like:

```
apify-cli/0.10.0 darwin-x64 node-v16.14.2
```

> You can also skip the manual global installation altogether and use `npx apify-cli` with all the following commands instead.

## Basic usage

The following examples demonstrate the basic usage of Apify CLI.

### Create a new Actor from scratch

```bash
apify create my-hello-world
```

First, you will be prompted to select a template with the boilerplate for the Actor, to help you get started quickly.
The command will create a directory called `my-hello-world` that contains a Node.js project
for the Actor and a few configuration files.

> If you decided to skip the installation and go with `npx`, the command will be `npx apify-cli create my-hello-world`.

### Create a new Actor from existing project

```bash
cd ./my/awesome/project
apify init
```

This command will only set up local Actor development environment in an existing directory,
i.e. it will create the `.actor/actor.json` file and `apify_storage` directory.

Before you can run your project locally using `apify run`, you have to set up the right start command in `package.json` under scripts.start. For example:

```text
{
    ...
    "scripts": {
        "start": "node your_main_file.js",
    },
    ...
}
```

You can find more information about by running `apify help run`.

### Create a new Actor from Scrapy project

If you want to run a Scrapy project on Apify platform, follow the Scrapy integration guide [here](https://docs.apify.com/cli/docs/integrating-scrapy).

### Run the Actor locally

```bash
cd my-hello-world
apify run
```

This command runs the Actor on your local machine.
Now's your chance to develop the logic - or magic :smirk:

### Login with your Apify account

```bash
apify login
```

Before you can interact with the Apify cloud, you need to [create an Apify account](https://console.apify.com/)
and log in to it using the above command. You will be prompted for
your [Apify API token](https://console.apify.com/settings/integrations).
Note that the command will store the API token and other sensitive information to `~/.apify`.

### Push the Actor to the Apify cloud

```bash
apify push
```

This command uploads your project to the Apify cloud and builds an Actor from it. On the platform, Actor needs to be built before it can be run.

### Run an Actor on the Apify cloud

```bash
apify call
```

Runs the Actor corresponding to the current directory on the Apify platform.

This command can also be used to run other Actors, for example:

```bash
apify call apify/hello-world
```

### So what's in this .actor/actor.json file?

This file associates your local development project with an Actor on the Apify platform.
It contains information such as Actor name, version, build tag and environment variables.
Make sure you commit this file to the Git repository.

For example, `.actor/actor.json` file can look as follows:

```json
{
  "actorSpecification": 1,
  "name": "name-of-my-scraper",
  "version": "0.0",
  "buildTag": "latest",
  "environmentVariables": {
    "MYSQL_USER": "my_username",
    "MYSQL_PASSWORD": "@mySecretPassword"
  },
  "dockerfile": "./Dockerfile",
  "readme": "./ACTOR.md",
  "input": "./input_schema.json",
  "storages": {
    "dataset": "./dataset_schema.json"
  }
}
```

**`Dockerfile` field**\
If you specify the path to your Docker file under the `dockerfile` field, this file will be used for Actor builds on the platform. If not specified, the system will look for Docker files at `.actor/Dockerfile` and `Dockerfile` in this order of preference.

**`Readme` field** \
If you specify the path to your readme file under the `readme` field, the readme at this path will be used on the platform. If not specified, readme at `.actor/README.md` and `README.md` will be used in this order of preference.

**`Input` field**\
You can embed your [input schema](https://docs.apify.com/actors/development/input-schema#specification-version-1) object directly in `actor.json` under `input` field. Alternatively, you can provide a path to a custom input schema. If not provided, the input schema at `.actor/INPUT_SCHEMA.json` and `INPUT_SCHEMA.json` is used in this order of preference.

**`Storages.dataset` field**\
You can define the schema of the items in your dataset under the `storages.dataset` field. This can be either an embedded object or a path to a JSON schema file. You can read more about the schema of your Actor output [here](https://docs.apify.com/actors/development/output-schema#specification-version-1).

**Note on migration from deprecated config "apify.json"**\
_Note that previously, Actor config was stored in the `apify.json` file that has been deprecated. You can find the (very slight) differences and migration info in [migration guidelines](https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md)._

## Environment variables

There are two options how you can set up environment variables for Actors.

### Set up environment variables in .actor/actor.json

All keys from `env` will be set as environment variables into Apify platform after you push Actor to Apify. Current values on Apify will be overridden.

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest",
  "environmentVariables": {
    "MYSQL_USER": "my_username",
    "MYSQL_PASSWORD": "@mySecretPassword"
  }
}
```

### Set up environment variables in Apify Console

In [Apify Console](https://console.apify.com/actors) select your Actor, you can set up variables into Source tab.
After setting up variables in the app, remove the `environmentVariables` from `.actor/actor.json`. Otherwise, variables from `.actor/actor.json` will override variables in the app.

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest"
}
```

#### How to set secret environment variables in .actor/actor.json

CLI provides commands to manage secrets environment variables. Secrets are stored to the `~/.apify` directory.
You can add a new secret using the command:

```bash
apify secrets:add mySecretPassword pwd1234
```

After adding a new secret you can use the secret in `.actor/actor.json`.

```text
{
    "actorSpecification": 1,
    "name": "dataset-to-mysql",
    ...
    "environmentVariables": {
      "MYSQL_PASSWORD": "@mySecretPassword"
    },
    ...
}
```

### Need help?

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

<!-- prettier-ignore-start -->
<!-- commands -->
* [`apify actor`](#apify-actor)
* [`apify actor get-input`](#apify-actor-get-input)
* [`apify actor get-value KEY`](#apify-actor-get-value-key)
* [`apify actor push-data [ITEM]`](#apify-actor-push-data-item)
* [`apify actor set-value KEY [VALUE]`](#apify-actor-set-value-key-value)
* [`apify actors`](#apify-actors)
* [`apify actors build [ACTORID]`](#apify-actors-build-actorid)
* [`apify actors call [ACTORID]`](#apify-actors-call-actorid)
* [`apify actors info ACTORID`](#apify-actors-info-actorid)
* [`apify actors ls`](#apify-actors-ls)
* [`apify actors pull [ACTORID]`](#apify-actors-pull-actorid)
* [`apify actors push [ACTORID]`](#apify-actors-push-actorid)
* [`apify actors rm ACTORID`](#apify-actors-rm-actorid)
* [`apify actors start [ACTORID]`](#apify-actors-start-actorid)
* [`apify builds`](#apify-builds)
* [`apify builds create [ACTORID]`](#apify-builds-create-actorid)
* [`apify builds info BUILDID`](#apify-builds-info-buildid)
* [`apify builds log BUILDID`](#apify-builds-log-buildid)
* [`apify builds ls [ACTORID]`](#apify-builds-ls-actorid)
* [`apify builds rm BUILDID`](#apify-builds-rm-buildid)
* [`apify call [ACTORID]`](#apify-call-actorid)
* [`apify create [ACTORNAME]`](#apify-create-actorname)
* [`apify datasets`](#apify-datasets)
* [`apify datasets create [DATASETNAME]`](#apify-datasets-create-datasetname)
* [`apify datasets get-items DATASETID`](#apify-datasets-get-items-datasetid)
* [`apify datasets info STOREID`](#apify-datasets-info-storeid)
* [`apify datasets ls`](#apify-datasets-ls)
* [`apify datasets push-items NAMEORID [ITEM]`](#apify-datasets-push-items-nameorid-item)
* [`apify datasets rename NAMEORID [NEWNAME]`](#apify-datasets-rename-nameorid-newname)
* [`apify datasets rm DATASETNAMEORID`](#apify-datasets-rm-datasetnameorid)
* [`apify help [COMMAND]`](#apify-help-command)
* [`apify info`](#apify-info)
* [`apify init [ACTORNAME]`](#apify-init-actorname)
* [`apify key-value-stores`](#apify-key-value-stores)
* [`apify key-value-stores create [KEYVALUESTORENAME]`](#apify-key-value-stores-create-keyvaluestorename)
* [`apify key-value-stores delete-value STOREID ITEMKEY`](#apify-key-value-stores-delete-value-storeid-itemkey)
* [`apify key-value-stores get-value KEYVALUESTOREID ITEMKEY`](#apify-key-value-stores-get-value-keyvaluestoreid-itemkey)
* [`apify key-value-stores info STOREID`](#apify-key-value-stores-info-storeid)
* [`apify key-value-stores keys STOREID`](#apify-key-value-stores-keys-storeid)
* [`apify key-value-stores ls`](#apify-key-value-stores-ls)
* [`apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME]`](#apify-key-value-stores-rename-keyvaluestorenameorid-newname)
* [`apify key-value-stores rm KEYVALUESTORENAMEORID`](#apify-key-value-stores-rm-keyvaluestorenameorid)
* [`apify key-value-stores set-value STOREID ITEMKEY [VALUE]`](#apify-key-value-stores-set-value-storeid-itemkey-value)
* [`apify login`](#apify-login)
* [`apify logout`](#apify-logout)
* [`apify pull [ACTORID]`](#apify-pull-actorid)
* [`apify push [ACTORID]`](#apify-push-actorid)
* [`apify request-queues`](#apify-request-queues)
* [`apify run`](#apify-run)
* [`apify runs`](#apify-runs)
* [`apify runs abort RUNID`](#apify-runs-abort-runid)
* [`apify runs info RUNID`](#apify-runs-info-runid)
* [`apify runs log RUNID`](#apify-runs-log-runid)
* [`apify runs ls [ACTORID]`](#apify-runs-ls-actorid)
* [`apify runs resurrect RUNID`](#apify-runs-resurrect-runid)
* [`apify runs rm RUNID`](#apify-runs-rm-runid)
* [`apify secrets`](#apify-secrets)
* [`apify secrets add NAME VALUE`](#apify-secrets-add-name-value)
* [`apify secrets rm NAME`](#apify-secrets-rm-name)
* [`apify task`](#apify-task)
* [`apify task run TASKID`](#apify-task-run-taskid)
* [`apify validate-schema [PATH]`](#apify-validate-schema-path)

## `apify actor`

Manages runtime data operations inside of a running Actor.

```
USAGE
  $ apify actor

DESCRIPTION
  Manages runtime data operations inside of a running Actor.
```

_See code: [src/commands/actor/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actor/index.ts)_

## `apify actor get-input`

Gets the Actor input value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-input

DESCRIPTION
  Gets the Actor input value from the default key-value store associated with the Actor run.
```

_See code: [src/commands/actor/get-input.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actor/get-input.ts)_

## `apify actor get-value KEY`

Gets a value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-value KEY

ARGUMENTS
  KEY  Key of the record in key-value store

DESCRIPTION
  Gets a value from the default key-value store associated with the Actor run.
```

_See code: [src/commands/actor/get-value.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actor/get-value.ts)_

## `apify actor push-data [ITEM]`

Saves data to Actor's run default dataset.

```
USAGE
  $ apify actor push-data [ITEM]

ARGUMENTS
  ITEM  JSON string with one object or array of objects containing data to be stored in the default dataset.

DESCRIPTION
  Saves data to Actor's run default dataset.

  Accept input as:
  - JSON argument:
  $ apify actor push-data {"key": "value"}
  - Piped stdin:
  $ cat ./test.json | apify actor push-data
```

_See code: [src/commands/actor/push-data.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actor/push-data.ts)_

## `apify actor set-value KEY [VALUE]`

Sets or removes record into the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor set-value KEY [VALUE] [-c <value>]

ARGUMENTS
  KEY    Key of the record in key-value store.
  VALUE  Record data, which can be one of the following values:
         - If empty, the record in the key-value store is deleted.
         - If no `contentType` flag is specified, value is expected to be any JSON string value.
         - If options.contentType is set, value is taken as is.

FLAGS
  -c, --contentType=<value>  Specifies a custom MIME content type of the record. By default "application/json" is used.

DESCRIPTION
  Sets or removes record into the default key-value store associated with the Actor run.

  It is possible to pass data using argument or stdin.

  Passing data using argument:
  $ apify actor set-value KEY my-value

  Passing data using stdin with pipe:
  $ cat ./my-text-file.txt | apify actor set-value KEY --contentType text/plain
```

_See code: [src/commands/actor/set-value.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actor/set-value.ts)_

## `apify actors`

Manages Actor creation, deployment, and execution on the Apify platform.

```
USAGE
  $ apify actors

DESCRIPTION
  Manages Actor creation, deployment, and execution on the Apify platform.
```

_See code: [src/commands/actors/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/index.ts)_

## `apify actors build [ACTORID]`

Creates a new build of the Actor.

```
USAGE
  $ apify actors build [ACTORID] [--json] [--tag <value>] [--version <value>] [--log]

ARGUMENTS
  ACTORID  Optional Actor ID or Name to trigger a build for. By default, it will use the Actor from the current
           directory.

FLAGS
  --log              Whether to print out the build log after the build is triggered.
  --tag=<value>      Build tag to be applied to the successful Actor build. By default, this is "latest".
  --version=<value>  Optional Actor Version to build. By default, this will be inferred from the tag, but this flag is
                     required when multiple versions have the same tag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new build of the Actor.
```

_See code: [src/commands/actors/build.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/build.ts)_

## `apify actors call [ACTORID]`

Executes Actor remotely using your authenticated account.

```
USAGE
  $ apify actors call [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>] [-s] [-o]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the '.actor/actor.json' file.

FLAGS
  -b, --build=<value>       Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be given to the Actor.
  -m, --memory=<value>      Amount of memory allocated for the Actor run, in megabytes.
  -o, --output-dataset      Prints out the entire default dataset on successful run of the Actor.
  -s, --silent              Prevents printing the logs of the Actor run to the console.
  -t, --timeout=<value>     Timeout for the Actor run in seconds. Zero value means there is no timeout.
      --input-file=<value>  Optional path to a file with JSON input to be given to the Actor. The file must be a valid
                            JSON file. You can also specify `-` to read from standard input.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Executes Actor remotely using your authenticated account.
  Reads input from local key-value store by default.
```

_See code: [src/commands/actors/call.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/call.ts)_

## `apify actors info ACTORID`

Get information about an Actor.

```
USAGE
  $ apify actors info ACTORID [--json] [--readme | --input]

ARGUMENTS
  ACTORID  The ID of the Actor to return information about.

FLAGS
  --input   Return the Actor input schema.
  --readme  Return the Actor README.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get information about an Actor.
```

_See code: [src/commands/actors/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/info.ts)_

## `apify actors ls`

Prints a list of recently executed Actors or Actors you own.

```
USAGE
  $ apify actors ls [--json] [--my] [--offset <value>] [--limit <value>] [--desc]

FLAGS
  --desc            Sort Actors in descending order.
  --limit=<value>   [default: 20] Number of Actors that will be listed.
  --my              Whether to list Actors made by the logged in user.
  --offset=<value>  Number of Actors that will be skipped.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints a list of recently executed Actors or Actors you own.
```

_See code: [src/commands/actors/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/ls.ts)_

## `apify actors pull [ACTORID]`

Download Actor code to current directory. Clones Git repositories or fetches Actor files based on the source type.

```
USAGE
  $ apify actors pull [ACTORID] [-v <value>] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will update the Actor in the current directory based on its name in ".actor/actor.json" file.

FLAGS
  -v, --version=<value>  Actor version number which will be pulled, e.g. 1.2. Default: the highest version
      --dir=<value>      Directory where the Actor should be pulled to

DESCRIPTION
  Download Actor code to current directory. Clones Git repositories or fetches Actor files based on the source type.
```

_See code: [src/commands/actors/pull.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/pull.ts)_

## `apify actors push [ACTORID]`

Deploys Actor to Apify platform using settings from '.actor/actor.json'.

```
USAGE
  $ apify actors push [ACTORID] [-v <value>] [-b <value>] [-w <value>] [--no-prompt] [--force] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the Actor with the name specified in '.actor/actor.json' file.

FLAGS
  -b, --build-tag=<value>        Build tag to be applied to the successful Actor build. By default, it is taken from the
                                 '.actor/actor.json' file
  -v, --version=<value>          Actor version number to which the files should be pushed. By default, it is taken from
                                 the '.actor/actor.json' file.
  -w, --wait-for-finish=<value>  Seconds for waiting to build to finish, if no value passed, it waits forever.
      --dir=<value>              Directory where the Actor is located
      --force                    Push an Actor even when the local files are older than the Actor on the platform.
      --no-prompt                Do not prompt for opening the Actor details in a browser. This will also not open the
                                 browser automatically.

DESCRIPTION
  Deploys Actor to Apify platform using settings from '.actor/actor.json'.
  Files under '3' MB upload as "Multiple source files"; larger projects upload as ZIP file.
  Use --force to override newer remote versions.
```

_See code: [src/commands/actors/push.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/push.ts)_

## `apify actors rm ACTORID`

Permanently removes an Actor from your account.

```
USAGE
  $ apify actors rm ACTORID

ARGUMENTS
  ACTORID  The Actor ID to delete.

DESCRIPTION
  Permanently removes an Actor from your account.
```

_See code: [src/commands/actors/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/rm.ts)_

## `apify actors start [ACTORID]`

Starts Actor remotely and returns run details immediately.

```
USAGE
  $ apify actors start [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the '.actor/actor.json' file.

FLAGS
  -b, --build=<value>       Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be given to the Actor.
  -m, --memory=<value>      Amount of memory allocated for the Actor run, in megabytes.
  -t, --timeout=<value>     Timeout for the Actor run in seconds. Zero value means there is no timeout.
      --input-file=<value>  Optional path to a file with JSON input to be given to the Actor. The file must be a valid
                            JSON file. You can also specify `-` to read from standard input.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Starts Actor remotely and returns run details immediately.
  Uses authenticated account and local key-value store for input.
```

_See code: [src/commands/actors/start.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/actors/start.ts)_

## `apify builds`

Manages Actor build processes and versioning.

```
USAGE
  $ apify builds

DESCRIPTION
  Manages Actor build processes and versioning.
```

_See code: [src/commands/builds/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/index.ts)_

## `apify builds create [ACTORID]`

Creates a new build of the Actor.

```
USAGE
  $ apify builds create [ACTORID] [--json] [--tag <value>] [--version <value>] [--log]

ARGUMENTS
  ACTORID  Optional Actor ID or Name to trigger a build for. By default, it will use the Actor from the current
           directory.

FLAGS
  --log              Whether to print out the build log after the build is triggered.
  --tag=<value>      Build tag to be applied to the successful Actor build. By default, this is "latest".
  --version=<value>  Optional Actor Version to build. By default, this will be inferred from the tag, but this flag is
                     required when multiple versions have the same tag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new build of the Actor.
```

_See code: [src/commands/builds/create.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/create.ts)_

## `apify builds info BUILDID`

Prints information about a specific build.

```
USAGE
  $ apify builds info BUILDID [--json]

ARGUMENTS
  BUILDID  The build ID to get information about.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints information about a specific build.
```

_See code: [src/commands/builds/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/info.ts)_

## `apify builds log BUILDID`

Prints the log of a specific build.

```
USAGE
  $ apify builds log BUILDID

ARGUMENTS
  BUILDID  The build ID to get the log from.

DESCRIPTION
  Prints the log of a specific build.
```

_See code: [src/commands/builds/log.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/log.ts)_

## `apify builds ls [ACTORID]`

Lists all builds of the Actor.

```
USAGE
  $ apify builds ls [ACTORID] [--json] [--offset <value>] [--limit <value>] [--desc] [-c]

ARGUMENTS
  ACTORID  Optional Actor ID or Name to list runs for. By default, it will use the Actor from the current directory.

FLAGS
  -c, --compact         Display a compact table.
      --desc            Sort builds in descending order.
      --limit=<value>   [default: 10] Number of builds that will be listed.
      --offset=<value>  Number of builds that will be skipped.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all builds of the Actor.
```

_See code: [src/commands/builds/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/ls.ts)_

## `apify builds rm BUILDID`

Permanently removes an Actor build from the Apify platform.

```
USAGE
  $ apify builds rm BUILDID

ARGUMENTS
  BUILDID  The build ID to delete.

DESCRIPTION
  Permanently removes an Actor build from the Apify platform.
```

_See code: [src/commands/builds/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/builds/rm.ts)_

## `apify call [ACTORID]`

Executes Actor remotely using your authenticated account.

```
USAGE
  $ apify call [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>] [-s] [-o]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the '.actor/actor.json' file.

FLAGS
  -b, --build=<value>       Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be given to the Actor.
  -m, --memory=<value>      Amount of memory allocated for the Actor run, in megabytes.
  -o, --output-dataset      Prints out the entire default dataset on successful run of the Actor.
  -s, --silent              Prevents printing the logs of the Actor run to the console.
  -t, --timeout=<value>     Timeout for the Actor run in seconds. Zero value means there is no timeout.
      --input-file=<value>  Optional path to a file with JSON input to be given to the Actor. The file must be a valid
                            JSON file. You can also specify `-` to read from standard input.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Executes Actor remotely using your authenticated account.
  Reads input from local key-value store by default.
```

_See code: [src/commands/call.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/call.ts)_

## `apify create [ACTORNAME]`

Creates an Actor project from a template in a new directory.

```
USAGE
  $ apify create [ACTORNAME] [-t <value>] [--skip-dependency-install] [--omit-optional-deps]

ARGUMENTS
  ACTORNAME  Name of the Actor and its directory

FLAGS
  -t, --template=<value>         Template for the Actor. If not provided, the command will prompt for it.
                                 Visit
                                 https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json
                                 to find available template names.
      --omit-optional-deps       Skip installing optional dependencies.
      --skip-dependency-install  Skip installing Actor dependencies.

DESCRIPTION
  Creates an Actor project from a template in a new directory.
```

_See code: [src/commands/create.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/create.ts)_

## `apify datasets`

Manages structured data storage and retrieval.

```
USAGE
  $ apify datasets

DESCRIPTION
  Manages structured data storage and retrieval.
```

_See code: [src/commands/datasets/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/index.ts)_

## `apify datasets create [DATASETNAME]`

Creates a new dataset for storing structured data on your account.

```
USAGE
  $ apify datasets create [DATASETNAME] [--json]

ARGUMENTS
  DATASETNAME  Optional name for the Dataset

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new dataset for storing structured data on your account.
```

_See code: [src/commands/datasets/create.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/create.ts)_

## `apify datasets get-items DATASETID`

Retrieves dataset items in specified format (JSON, CSV, etc).

```
USAGE
  $ apify datasets get-items DATASETID [--limit <value>] [--offset <value>] [--format json|jsonl|csv|html|rss|xml|xlsx]

ARGUMENTS
  DATASETID  The ID of the Dataset to export the items for

FLAGS
  --format=<option>  [default: json] The format of the returned output. By default, it is set to 'json'
                     <options: json|jsonl|csv|html|rss|xml|xlsx>
  --limit=<value>    The amount of elements to get from the dataset. By default, it will return all available items.
  --offset=<value>   The offset in the dataset where to start getting items.

DESCRIPTION
  Retrieves dataset items in specified format (JSON, CSV, etc).
```

_See code: [src/commands/datasets/get-items.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/get-items.ts)_

## `apify datasets info STOREID`

Prints information about a specific dataset.

```
USAGE
  $ apify datasets info STOREID [--json]

ARGUMENTS
  STOREID  The dataset store ID to print information about.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints information about a specific dataset.
```

_See code: [src/commands/datasets/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/info.ts)_

## `apify datasets ls`

Prints all datasets on your account.

```
USAGE
  $ apify datasets ls [--json] [--offset <value>] [--limit <value>] [--desc] [--unnamed]

FLAGS
  --desc            Sorts datasets in descending order.
  --limit=<value>   [default: 20] Number of datasets that will be listed.
  --offset=<value>  Number of datasets that will be skipped.
  --unnamed         Lists datasets that don't have a name set.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints all datasets on your account.
```

_See code: [src/commands/datasets/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/ls.ts)_

## `apify datasets push-items NAMEORID [ITEM]`

Adds data items to specified dataset. Accepts single object or array of objects.

```
USAGE
  $ apify datasets push-items NAMEORID [ITEM]

ARGUMENTS
  NAMEORID  The dataset ID or name to push the objects to
  ITEM      The object or array of objects to be pushed.

DESCRIPTION
  Adds data items to specified dataset. Accepts single object or array of objects.
```

_See code: [src/commands/datasets/push-items.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/push-items.ts)_

## `apify datasets rename NAMEORID [NEWNAME]`

Change dataset name or removes name with --unname flag.

```
USAGE
  $ apify datasets rename NAMEORID [NEWNAME] [--unname]

ARGUMENTS
  NAMEORID  The dataset ID or name to delete.
  NEWNAME   The new name for the dataset.

FLAGS
  --unname  Removes the unique name of the dataset.

DESCRIPTION
  Change dataset name or removes name with --unname flag.
```

_See code: [src/commands/datasets/rename.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/rename.ts)_

## `apify datasets rm DATASETNAMEORID`

Permanently removes a dataset.

```
USAGE
  $ apify datasets rm DATASETNAMEORID

ARGUMENTS
  DATASETNAMEORID  The dataset ID or name to delete

DESCRIPTION
  Permanently removes a dataset.
```

_See code: [src/commands/datasets/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/datasets/rm.ts)_

## `apify help [COMMAND]`

Display help for apify.

```
USAGE
  $ apify help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for apify.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.23/src/commands/help.ts)_

## `apify info`

Prints details about your currently authenticated Apify account.

```
USAGE
  $ apify info

DESCRIPTION
  Prints details about your currently authenticated Apify account.
```

_See code: [src/commands/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/info.ts)_

## `apify init [ACTORNAME]`

Sets up an Actor project in your current directory by creating actor.json and storage files.

```
USAGE
  $ apify init [ACTORNAME] [-y]

ARGUMENTS
  ACTORNAME  Name of the Actor. If not provided, you will be prompted for it.

FLAGS
  -y, --yes  Automatic yes to prompts; assume "yes" as answer to all prompts. Note that in some cases, the command may
             still ask for confirmation.

DESCRIPTION
  Sets up an Actor project in your current directory by creating actor.json and storage files.
  If the directory contains a Scrapy project in Python, the command automatically creates wrappers so that you can run
  your scrapers without changes.
  Creates the '.actor/actor.json' file and the 'storage' directory in the current directory, but does not touch any
  other existing files or directories.

  WARNING: Overwrites existing 'storage' directory.
```

_See code: [src/commands/init.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/init.ts)_

## `apify key-value-stores`

Manages persistent key-value storage.

```
USAGE
  $ apify key-value-stores

DESCRIPTION
  Manages persistent key-value storage.

  Alias: kvs
```

_See code: [src/commands/key-value-stores/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/index.ts)_

## `apify key-value-stores create [KEYVALUESTORENAME]`

Creates a new key-value store on your account.

```
USAGE
  $ apify key-value-stores create [KEYVALUESTORENAME] [--json]

ARGUMENTS
  KEYVALUESTORENAME  Optional name for the key-value store

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new key-value store on your account.
```

_See code: [src/commands/key-value-stores/create.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/create.ts)_

## `apify key-value-stores delete-value STOREID ITEMKEY`

Delete a value from a key-value store.

```
USAGE
  $ apify key-value-stores delete-value STOREID ITEMKEY

ARGUMENTS
  STOREID  The key-value store ID to delete the value from.
  ITEMKEY  The key of the item in the key-value store.

DESCRIPTION
  Delete a value from a key-value store.
```

_See code: [src/commands/key-value-stores/delete-value.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/delete-value.ts)_

## `apify key-value-stores get-value KEYVALUESTOREID ITEMKEY`

Retrieves stored value for specified key. Use --only-content-type to check MIME type.

```
USAGE
  $ apify key-value-stores get-value KEYVALUESTOREID ITEMKEY [--only-content-type]

ARGUMENTS
  KEYVALUESTOREID  The key-value store ID to get the value from.
  ITEMKEY          The key of the item in the key-value store.

FLAGS
  --only-content-type  Only return the content type of the specified key

DESCRIPTION
  Retrieves stored value for specified key. Use --only-content-type to check MIME type.
```

_See code: [src/commands/key-value-stores/get-value.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/get-value.ts)_

## `apify key-value-stores info STOREID`

Shows information about a key-value store.

```
USAGE
  $ apify key-value-stores info STOREID [--json]

ARGUMENTS
  STOREID  The key-value store ID to print information about.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Shows information about a key-value store.
```

_See code: [src/commands/key-value-stores/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/info.ts)_

## `apify key-value-stores keys STOREID`

Lists all keys in a key-value store.

```
USAGE
  $ apify key-value-stores keys STOREID [--json] [--limit <value>] [--exclusive-start-key <value>]

ARGUMENTS
  STOREID  The key-value store ID to list keys for.

FLAGS
  --exclusive-start-key=<value>  The key to start the list from.
  --limit=<value>                [default: 20] The maximum number of keys to return.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all keys in a key-value store.
```

_See code: [src/commands/key-value-stores/keys.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/keys.ts)_

## `apify key-value-stores ls`

Lists all key-value stores on your account.

```
USAGE
  $ apify key-value-stores ls [--json] [--offset <value>] [--limit <value>] [--desc] [--unnamed]

FLAGS
  --desc            Sorts key-value stores in descending order.
  --limit=<value>   [default: 20] Number of key-value stores that will be listed.
  --offset=<value>  Number of key-value stores that will be skipped.
  --unnamed         Lists key-value stores that don't have a name set.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all key-value stores on your account.
```

_See code: [src/commands/key-value-stores/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/ls.ts)_

## `apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME]`

Renames a key-value store, or removes its unique name.

```
USAGE
  $ apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME] [--unname]

ARGUMENTS
  KEYVALUESTORENAMEORID  The key-value store ID or name to delete
  NEWNAME                The new name for the key-value store

FLAGS
  --unname  Removes the unique name of the key-value store

DESCRIPTION
  Renames a key-value store, or removes its unique name.
```

_See code: [src/commands/key-value-stores/rename.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/rename.ts)_

## `apify key-value-stores rm KEYVALUESTORENAMEORID`

Permanently removes a key-value store.

```
USAGE
  $ apify key-value-stores rm KEYVALUESTORENAMEORID

ARGUMENTS
  KEYVALUESTORENAMEORID  The key-value store ID or name to delete

DESCRIPTION
  Permanently removes a key-value store.
```

_See code: [src/commands/key-value-stores/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/rm.ts)_

## `apify key-value-stores set-value STOREID ITEMKEY [VALUE]`

Stores value with specified key. Set content-type with --content-type flag.

```
USAGE
  $ apify key-value-stores set-value STOREID ITEMKEY [VALUE] [--content-type <value>]

ARGUMENTS
  STOREID  The key-value store ID to set the value in.
  ITEMKEY  The key of the item in the key-value store.
  VALUE    The value to set.

FLAGS
  --content-type=<value>  [default: application/json] The MIME content type of the value. By default, "application/json"
                          is assumed.

DESCRIPTION
  Stores value with specified key. Set content-type with --content-type flag.
```

_See code: [src/commands/key-value-stores/set-value.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/key-value-stores/set-value.ts)_

## `apify login`

Authenticates your Apify account and saves credentials to '~/.apify'.

```
USAGE
  $ apify login [-t <value>] [-m console|manual]

FLAGS
  -m, --method=<option>  [Optional] Method of logging in to Apify
                         <options: console|manual>
  -t, --token=<value>    [Optional] Apify API token

DESCRIPTION
  Authenticates your Apify account and saves credentials to '~/.apify'.
  All other commands use these stored credentials.

  Run 'apify logout' to remove authentication.
```

_See code: [src/commands/login.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/login.ts)_

## `apify logout`

Removes authentication by deleting your API token and account information from '~/.apify'.

```
USAGE
  $ apify logout

DESCRIPTION
  Removes authentication by deleting your API token and account information from '~/.apify'.
  Run 'apify login' to authenticate again.
```

_See code: [src/commands/logout.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/logout.ts)_

## `apify pull [ACTORID]`

Download Actor code to current directory. Clones Git repositories or fetches Actor files based on the source type.

```
USAGE
  $ apify pull [ACTORID] [-v <value>] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will update the Actor in the current directory based on its name in ".actor/actor.json" file.

FLAGS
  -v, --version=<value>  Actor version number which will be pulled, e.g. 1.2. Default: the highest version
      --dir=<value>      Directory where the Actor should be pulled to

DESCRIPTION
  Download Actor code to current directory. Clones Git repositories or fetches Actor files based on the source type.
```

_See code: [src/commands/pull.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/pull.ts)_

## `apify push [ACTORID]`

Deploys Actor to Apify platform using settings from '.actor/actor.json'.

```
USAGE
  $ apify push [ACTORID] [-v <value>] [-b <value>] [-w <value>] [--no-prompt] [--force] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the Actor with the name specified in '.actor/actor.json' file.

FLAGS
  -b, --build-tag=<value>        Build tag to be applied to the successful Actor build. By default, it is taken from the
                                 '.actor/actor.json' file
  -v, --version=<value>          Actor version number to which the files should be pushed. By default, it is taken from
                                 the '.actor/actor.json' file.
  -w, --wait-for-finish=<value>  Seconds for waiting to build to finish, if no value passed, it waits forever.
      --dir=<value>              Directory where the Actor is located
      --force                    Push an Actor even when the local files are older than the Actor on the platform.
      --no-prompt                Do not prompt for opening the Actor details in a browser. This will also not open the
                                 browser automatically.

DESCRIPTION
  Deploys Actor to Apify platform using settings from '.actor/actor.json'.
  Files under '3' MB upload as "Multiple source files"; larger projects upload as ZIP file.
  Use --force to override newer remote versions.
```

_See code: [src/commands/push.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/push.ts)_

## `apify request-queues`

Manages URL queues for web scraping and automation tasks.

```
USAGE
  $ apify request-queues

DESCRIPTION
  Manages URL queues for web scraping and automation tasks.
```

_See code: [src/commands/request-queues/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/request-queues/index.ts)_

## `apify run`

Executes Actor locally with simulated Apify environment variables.

```
USAGE
  $ apify run [-p] [--purge-queue] [--purge-dataset] [--purge-key-value-store] [--entrypoint <value>] [-i
    <value> | --input-file <value>]

FLAGS
  -i, --input=<value>          Optional JSON input to be given to the Actor.
  -p, --purge                  Shortcut that combines the --purge-queue, --purge-dataset and --purge-key-value-store
                               options.
      --entrypoint=<value>     Optional entrypoint for running with injected environment variables.
                               For Python, it is the module name, or a path to a file.
                               For node.js, it is the npm script name, or a path to a JS/MJS file. You can also pass in
                               a directory name, provided that directory contains an "index.js" file.
      --input-file=<value>     Optional path to a file with JSON input to be given to the Actor. The file must be a
                               valid JSON file. You can also specify `-` to read from standard input.
      --purge-dataset          Deletes the local directory containing the default dataset before the run starts.
      --purge-key-value-store  Deletes all records from the default key-value store in the local directory before the
                               run starts, except for the "INPUT" key.
      --purge-queue            Deletes the local directory containing the default request queue before the run starts.

DESCRIPTION
  Executes Actor locally with simulated Apify environment variables.
  Stores data in local 'storage' directory.

  NOTE: For Node.js Actors, customize behavior by modifying the 'start' script in package.json file.
```

_See code: [src/commands/run.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/run.ts)_

## `apify runs`

Manages Actor run operations

```
USAGE
  $ apify runs

DESCRIPTION
  Manages Actor run operations
```

_See code: [src/commands/runs/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/index.ts)_

## `apify runs abort RUNID`

Aborts an Actor run.

```
USAGE
  $ apify runs abort RUNID [--json] [-f]

ARGUMENTS
  RUNID  The run ID to abort.

FLAGS
  -f, --force  Whether to force the run to abort immediately, instead of gracefully.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Aborts an Actor run.
```

_See code: [src/commands/runs/abort.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/abort.ts)_

## `apify runs info RUNID`

Prints information about an Actor run.

```
USAGE
  $ apify runs info RUNID [--json] [-v]

ARGUMENTS
  RUNID  The run ID to print information about.

FLAGS
  -v, --verbose  Prints more in-depth information about the Actor run.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints information about an Actor run.
```

_See code: [src/commands/runs/info.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/info.ts)_

## `apify runs log RUNID`

Prints the log of a specific run.

```
USAGE
  $ apify runs log RUNID

ARGUMENTS
  RUNID  The run ID to get the log from.

DESCRIPTION
  Prints the log of a specific run.
```

_See code: [src/commands/runs/log.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/log.ts)_

## `apify runs ls [ACTORID]`

Lists all runs of the Actor.

```
USAGE
  $ apify runs ls [ACTORID] [--json] [--offset <value>] [--limit <value>] [--desc] [-c]

ARGUMENTS
  ACTORID  Optional Actor ID or Name to list runs for. By default, it will use the Actor from the current directory.

FLAGS
  -c, --compact         Display a compact table.
      --desc            Sort runs in descending order.
      --limit=<value>   [default: 10] Number of runs that will be listed.
      --offset=<value>  Number of runs that will be skipped.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all runs of the Actor.
```

_See code: [src/commands/runs/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/ls.ts)_

## `apify runs resurrect RUNID`

Resurrects an aborted or finished Actor Run.

```
USAGE
  $ apify runs resurrect RUNID [--json]

ARGUMENTS
  RUNID  The run ID to resurrect.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Resurrects an aborted or finished Actor Run.
```

_See code: [src/commands/runs/resurrect.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/resurrect.ts)_

## `apify runs rm RUNID`

Deletes an Actor Run.

```
USAGE
  $ apify runs rm RUNID

ARGUMENTS
  RUNID  The run ID to delete.

DESCRIPTION
  Deletes an Actor Run.
```

_See code: [src/commands/runs/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/runs/rm.ts)_

## `apify secrets`

Manages secure environment variables for Actors.

```
USAGE
  $ apify secrets

DESCRIPTION
  Manages secure environment variables for Actors.

  Example:
  $ apify secrets add mySecret TopSecretValue123

  The "mySecret" value can be used in an environment variable defined in '.actor/actor.json' file by adding the "@"
  prefix:

  {
  "actorSpecification": 1,
  "name": "my_actor",
  "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },
  "version": "0.1"
  }

  When the Actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is stored as a secret environment variable
  of the Actor.
```

_See code: [src/commands/secrets/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/secrets/index.ts)_

## `apify secrets add NAME VALUE`

Adds a new secret to '~/.apify' for use in Actor environment variables.

```
USAGE
  $ apify secrets add NAME VALUE

ARGUMENTS
  NAME   Name of the secret
  VALUE  Value of the secret

DESCRIPTION
  Adds a new secret to '~/.apify' for use in Actor environment variables.
```

_See code: [src/commands/secrets/add.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/secrets/add.ts)_

## `apify secrets rm NAME`

Permanently deletes a secret from your stored credentials.

```
USAGE
  $ apify secrets rm NAME

ARGUMENTS
  NAME  Name of the secret

DESCRIPTION
  Permanently deletes a secret from your stored credentials.
```

_See code: [src/commands/secrets/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/secrets/rm.ts)_

## `apify task`

Manages scheduled and predefined Actor configurations.

```
USAGE
  $ apify task

DESCRIPTION
  Manages scheduled and predefined Actor configurations.
```

_See code: [src/commands/task/index.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/task/index.ts)_

## `apify task run TASKID`

Executes predefined Actor task remotely using local key-value store for input.

```
USAGE
  $ apify task run TASKID [-b <value>] [-t <value>] [-m <value>]

ARGUMENTS
  TASKID  Name or ID of the Task to run (e.g. "my-task" or "E2jjCZBezvAZnX8Rb").

FLAGS
  -b, --build=<value>    Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -m, --memory=<value>   Amount of memory allocated for the Task run, in megabytes.
  -t, --timeout=<value>  Timeout for the Task run in seconds. Zero value means there is no timeout.

DESCRIPTION
  Executes predefined Actor task remotely using local key-value store for input.
  Customize with --memory and --timeout flags.
```

_See code: [src/commands/task/run.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/task/run.ts)_

## `apify validate-schema [PATH]`

Validates Actor input schema from one of these locations (in priority order):

```
USAGE
  $ apify validate-schema [PATH]

ARGUMENTS
  PATH  Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.

DESCRIPTION
  Validates Actor input schema from one of these locations (in priority order):
  1. Object in '.actor/actor.json' under "input" key
  2. JSON file path in '.actor/actor.json' "input" key
  3. .actor/INPUT_SCHEMA.json
  4. INPUT_SCHEMA.json

  Optionally specify custom schema path to validate.
```

_See code: [src/commands/validate-schema.ts](https://github.com/apify/apify-cli/blob/v0.21.1/src/commands/validate-schema.ts)_
<!-- commandsstop -->
<!-- prettier-ignore-end -->
