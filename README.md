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
*Note that previously, Actor config was stored in the `apify.json` file that has been deprecated. You can find the (very slight) differences and migration info in [migration guidelines](https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md).*

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

<!-- commands -->
* [`apify actor`](#apify-actor)
* [`apify actor get-input`](#apify-actor-get-input)
* [`apify actor get-value KEY`](#apify-actor-get-value-key)
* [`apify actor push-data [ITEM]`](#apify-actor-push-data-item)
* [`apify actor set-value KEY [VALUE]`](#apify-actor-set-value-key-value)
* [`apify call [ACTORID]`](#apify-call-actorid)
* [`apify create [ACTORNAME]`](#apify-create-actorname)
* [`apify help [COMMAND]`](#apify-help-command)
* [`apify info`](#apify-info)
* [`apify init [ACTORNAME]`](#apify-init-actorname)
* [`apify login`](#apify-login)
* [`apify logout`](#apify-logout)
* [`apify pull [ACTORID]`](#apify-pull-actorid)
* [`apify push [ACTORID]`](#apify-push-actorid)
* [`apify run`](#apify-run)
* [`apify secrets`](#apify-secrets)
* [`apify secrets add NAME VALUE`](#apify-secrets-add-name-value)
* [`apify secrets rm NAME`](#apify-secrets-rm-name)
* [`apify task`](#apify-task)
* [`apify task run TASKID`](#apify-task-run-taskid)
* [`apify validate-schema [PATH]`](#apify-validate-schema-path)

## `apify actor`

Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.

```
USAGE
  $ apify actor

DESCRIPTION
  Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.
```

_See code: [src/commands/actor/index.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/actor/index.ts)_

## `apify actor get-input`

Gets the Actor input value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-input

DESCRIPTION
  Gets the Actor input value from the default key-value store associated with the Actor run.
```

_See code: [src/commands/actor/get-input.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/actor/get-input.ts)_

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

_See code: [src/commands/actor/get-value.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/actor/get-value.ts)_

## `apify actor push-data [ITEM]`

Stores an object or an array of objects to the default dataset of the Actor run.

```
USAGE
  $ apify actor push-data [ITEM]

ARGUMENTS
  ITEM  JSON string with one object or array of objects containing data to be stored in the default dataset.

DESCRIPTION
  Stores an object or an array of objects to the default dataset of the Actor run.
  It is possible to pass data using item argument or stdin.
  Passing data using argument:
  $ apify actor push-data {"foo": "bar"}
  Passing data using stdin with pipe:
  $ cat ./test.json | apify actor push-data
```

_See code: [src/commands/actor/push-data.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/actor/push-data.ts)_

## `apify actor set-value KEY [VALUE]`

Sets or removes record into the default KeyValueStore associated with the Actor run.

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
  Sets or removes record into the default KeyValueStore associated with the Actor run.
  It is possible to pass data using argument or stdin.
  Passing data using argument:
  $ apify actor set-value KEY my-value
  Passing data using stdin with pipe:
  $ cat ./my-text-file.txt | apify actor set-value KEY --contentType text/plain
```

_See code: [src/commands/actor/set-value.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/actor/set-value.ts)_

## `apify call [ACTORID]`

Runs a specific Actor remotely on the Apify cloud platform.

```
USAGE
  $ apify call [ACTORID] [-b <value>] [-t <value>] [-m <value>] [-w <value>] [-i <value> | --input-file
    <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the ".actor/actor.json" file.

FLAGS
  -b, --build=<value>            Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -i, --input=<value>            Optional JSON input to be given to the Actor.
  -m, --memory=<value>           Amount of memory allocated for the Actor run, in megabytes.
  -t, --timeout=<value>          Timeout for the Actor run in seconds. Zero value means there is no timeout.
  -w, --wait-for-finish=<value>  Seconds for waiting to run to finish, if no value passed, it waits forever.
      --input-file=<value>       Optional path to a file with JSON input to be given to the Actor. The file must be a
                                 valid JSON file. You can also specify `-` to read from standard input.

DESCRIPTION
  Runs a specific Actor remotely on the Apify cloud platform.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/call.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/call.ts)_

## `apify create [ACTORNAME]`

Creates a new Actor project directory from a selected boilerplate template.

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
  Creates a new Actor project directory from a selected boilerplate template.
```

_See code: [src/commands/create.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/create.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.8/src/commands/help.ts)_

## `apify info`

Displays information about the currently active Apify account.

```
USAGE
  $ apify info

DESCRIPTION
  Displays information about the currently active Apify account.
  The information is printed to the console.
```

_See code: [src/commands/info.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/info.ts)_

## `apify init [ACTORNAME]`

Initializes a new Actor project in an existing directory.

```
USAGE
  $ apify init [ACTORNAME] [-y]

ARGUMENTS
  ACTORNAME  Name of the Actor. If not provided, you will be prompted for it.

FLAGS
  -y, --yes  Automatic yes to prompts; assume "yes" as answer to all prompts. Note that in some cases, the command may
             still ask for confirmation.

DESCRIPTION
  Initializes a new Actor project in an existing directory.
  If the directory contains a Scrapy project in Python, the command automatically creates wrappers so that you can run
  your scrapers without changes.

  The command creates the ".actor/actor.json" file and the "storage" directory in the current directory, but does not
  touch any other existing files or directories.

  WARNING: The directory at "storage" will be overwritten if it already exists.
```

_See code: [src/commands/init.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/init.ts)_

## `apify login`

Logs in to your Apify account.

```
USAGE
  $ apify login [-t <value>] [-m console|manual]

FLAGS
  -m, --method=<option>  [Optional] Method of logging in to Apify
                         <options: console|manual>
  -t, --token=<value>    [Optional] Apify API token

DESCRIPTION
  Logs in to your Apify account.
  The API token and other account information is stored in the ~/.apify directory, from where it is read by all other
  "apify" commands. To log out, call "apify logout".
```

_See code: [src/commands/login.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/login.ts)_

## `apify logout`

Logs out of your Apify account.

```
USAGE
  $ apify logout

DESCRIPTION
  Logs out of your Apify account.
  The command deletes the API token and all other account information stored in the ~/.apify directory. To log in again,
  call "apify login".
```

_See code: [src/commands/logout.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/logout.ts)_

## `apify pull [ACTORID]`

Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be cloned. If it is defined as Web IDE, it will fetch the files.

```
USAGE
  $ apify pull [ACTORID] [-v <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will update the Actor in the current directory based on its name in ".actor/actor.json" file.

FLAGS
  -v, --version=<value>  Actor version number which will be pulled, e.g. 1.2. Default: the highest version

DESCRIPTION
  Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be
  cloned. If it is defined as Web IDE, it will fetch the files.
```

_See code: [src/commands/pull.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/pull.ts)_

## `apify push [ACTORID]`

Uploads the Actor to the Apify platform and builds it there.

```
USAGE
  $ apify push [ACTORID] [--version-number <value>] [-v <value>] [-b <value>] [-w <value>] [--no-prompt]
    [--force]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the Actor with the name specified in ".actor/actor.json" file.

FLAGS
  -b, --build-tag=<value>        Build tag to be applied to the successful Actor build. By default, it is taken from the
                                 ".actor/actor.json" file
  -v, --version=<value>          Actor version number to which the files should be pushed. By default, it is taken from
                                 the ".actor/actor.json" file.
  -w, --wait-for-finish=<value>  Seconds for waiting to build to finish, if no value passed, it waits forever.
      --force                    Push an Actor even when the local files are older than the Actor on the platform.
      --no-prompt                Do not prompt for opening the Actor details in a browser. This will also not open the
                                 browser automatically.
      --version-number=<value>   DEPRECATED: Use flag version instead. Actor version number to which the files should be
                                 pushed. By default, it is taken from the ".actor/actor.json" file.

DESCRIPTION
  Uploads the Actor to the Apify platform and builds it there.
  The Actor settings are read from the ".actor/actor.json" file in the current directory, but they can be overridden
  using command-line options.
  NOTE: If the source files are smaller than 3 MB then they are uploaded as
  "Multiple source files", otherwise they are uploaded as "Zip file".

  When there's an attempt to push files that are older than the Actor on the platform, the command will fail. Can be
  overwritten with --force flag.
```

_See code: [src/commands/push.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/push.ts)_

## `apify run`

Runs the Actor locally in the current directory.

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
  Runs the Actor locally in the current directory.
  It sets various APIFY_XYZ environment variables in order to provide a working execution environment for the Actor. For
  example, this causes the Actor input, as well as all other data in key-value stores, datasets or request queues to be
  stored in the "storage" directory, rather than on the Apify platform.

  NOTE: You can override the command's default behavior for Node.js Actors by overriding the "start" script in the
  package.json file. You can set up your own main file or environment variables by changing it.
```

_See code: [src/commands/run.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/run.ts)_

## `apify secrets`

Manages secret values for Actor environment variables.

```
USAGE
  $ apify secrets

DESCRIPTION
  Manages secret values for Actor environment variables.

  Example:
  $ apify secrets add mySecret TopSecretValue123

  Now the "mySecret" value can be used in an environment variable defined in ".actor/actor.json" file by adding the "@"
  prefix:

  {
  "actorSpecification": 1,
  "name": "my_actor",
  "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },
  "version": "0.1
  }

  When the Actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is stored as a secret environment variable
  of the Actor.
```

_See code: [src/commands/secrets/index.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/secrets/index.ts)_

## `apify secrets add NAME VALUE`

Adds a new secret value.

```
USAGE
  $ apify secrets add NAME VALUE

ARGUMENTS
  NAME   Name of the secret
  VALUE  Value of the secret

DESCRIPTION
  Adds a new secret value.
  The secrets are stored to a file at ~/.apify
```

_See code: [src/commands/secrets/add.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/secrets/add.ts)_

## `apify secrets rm NAME`

Removes the secret.

```
USAGE
  $ apify secrets rm NAME

ARGUMENTS
  NAME  Name of the secret

DESCRIPTION
  Removes the secret.
```

_See code: [src/commands/secrets/rm.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/secrets/rm.ts)_

## `apify task`

Commands are designed to be used to interact with Tasks.

```
USAGE
  $ apify task

DESCRIPTION
  Commands are designed to be used to interact with Tasks.
```

_See code: [src/commands/task/index.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/task/index.ts)_

## `apify task run TASKID`

Runs a specific Actor remotely on the Apify cloud platform.

```
USAGE
  $ apify task run TASKID [-b <value>] [-t <value>] [-m <value>] [-w <value>]

ARGUMENTS
  TASKID  Name or ID of the Task to run (e.g. "my-task" or "E2jjCZBezvAZnX8Rb").

FLAGS
  -b, --build=<value>            Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -m, --memory=<value>           Amount of memory allocated for the Task run, in megabytes.
  -t, --timeout=<value>          Timeout for the Task run in seconds. Zero value means there is no timeout.
  -w, --wait-for-finish=<value>  Seconds for waiting to run to finish, if no value passed, it waits forever.

DESCRIPTION
  Runs a specific Actor remotely on the Apify cloud platform.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/task/run.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/task/run.ts)_

## `apify validate-schema [PATH]`

Validates input schema and prints errors found.

```
USAGE
  $ apify validate-schema [PATH]

ARGUMENTS
  PATH  Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.

DESCRIPTION
  Validates input schema and prints errors found.
  The input schema for the Actor is used from these locations in order of preference.
  The first one found is validated as it would be the one used on the Apify platform.
  1. Directly embedded object in ".actor/actor.json" under 'input' key
  2. Path to JSON file referenced in ".actor/actor.json" under 'input' key
  3. JSON file at .actor/INPUT_SCHEMA.json
  4. JSON file at INPUT_SCHEMA.json

  You can also pass any custom path to your input schema to have it validated instead.
```

_See code: [src/commands/validate-schema.ts](https://github.com/apify/apify-cli/blob/v0.20.3/src/commands/validate-schema.ts)_
<!-- commandsstop -->
