# Apify command-line interface (Apify CLI)

[![NPM version](https://badge.fury.io/js/apify-cli.svg)](https://www.npmjs.com/package/apify-cli)
[![GitHub workflow](https://github.com/apify/apify-cli/actions/workflows/check.yaml/badge.svg)](https://github.com/apify/apify-cli/actions/workflows/check.yaml)

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

### Via bundles

#### MacOS / Unix

```bash
curl -fsSL https://apify.com/install-cli.sh | bash
```

#### Windows

```powershell
irm https://apify.com/install-cli.ps1 | iex
```

### Via Homebrew

On macOS (or Linux), you can install the Apify CLI via the [Homebrew package manager](https://brew.sh).

```bash
brew install apify-cli
```

### Via NPM

First, make sure you have [Node.js](https://nodejs.org) version 22 or higher with NPM installed on your computer:

```bash
node --version
npm --version
```

Install or upgrade Apify CLI by running:

```bash
npm install -g apify-cli
```

Alternatively, you can use [fnm (Fast Node Manager)](https://github.com/Schniz/fnm) and install Apify CLI only into a selected user-level Node version without requiring root privileges:

```bash
fnm install 22
fnm use 22
npm install -g apify-cli
```

Finally, verify that Apify CLI was installed correctly by running:

```bash
apify --version
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

If you want to run a Scrapy project on Apify platform, follow the [Scrapy integration guide](https://docs.apify.com/cli/docs/integrating-scrapy).

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

See a list of all our commands on the [reference page](https://docs.apify.com/cli/docs/reference)
