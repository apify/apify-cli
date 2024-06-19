---
title: Installation
description: Learn how to install Apify CLI, and how to create, run, and manage Actors through it.
sidebar_label: Installation
---

## Installation

You can install Apify CLI either using [Homebrew package manager](https://brew.sh) on macOS or Linux or using NPM.

### Via Homebrew

Run the following command:

```bash showLineNumbers
brew install apify-cli
```

### Via NPM

First, make sure you have [Node.js](https://nodejs.org) version 18 or higher with NPM installed on your computer:

```bash showLineNumbers
node --version
npm --version
```

Install or upgrade Apify CLI by running:

```bash showLineNumbers
npm -g install apify-cli
```

If you receive a permission error, read npm's [official guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) on installing packages globally.

Alternatively, you can use [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) and install Apify CLI only into a selected user-level Node version without requiring root privileges:

```bash showLineNumbers
nvm install 18
nvm use 18
npm -g install apify-cli
```

After using either of these methods , verify that Apify CLI was installed correctly by running:

```bash showLineNumbers
apify --version
```

which should print something like:

```bash showLineNumbers
apify-cli/0.19.1 linux-x64 node-v18.17.0
```

## Basic Usage

The following examples demonstrate the basic usage of Apify CLI.

### Create a New Actor from Scratch

```bash showLineNumbers
apify create my-hello-world
```

First, you will be prompted to select a template with the boilerplate for the Actor, to help you get started quickly.
The command will create a directory called `my-hello-world` that contains a Node.js project
for the Actor and a few configuration files.

### Create a New Actor from Existing Project

:::tip Automatic Actor directory initialization
When you create an Actor using the `apify create` command, the directory will already be initialized.
:::

```bash showLineNumbers
cd ./my/awesome/project
apify init
```

This command will only set up local Actor development environment in an existing directory,
i.e. it will create the `.actor/actor.json` file and `apify_storage` directory.

Before you can run your project locally using `apify run`, you have to set up the right start command in `package.json` under scripts.start. For example:

```json showLineNumbers
{
    ...
    "scripts": {
        "start": "node your_main_file.js",
    },
    ...
}
```

You can find more information about by running `apify help run`.

### Run the Actor Locally

```bash showLineNumbers
cd my-hello-world
apify run
```

This command runs the Actor on your local machine.
Now's your chance to develop the logic - or magic :smirk:

### Login with your Apify account

```bash showLineNumbers
apify login
```

Before you can interact with the Apify cloud, you need to [create an Apify account](https://console.apify.com/)
and log in to it using the above command. You will be prompted for
your [Apify API token](https://console.apify.com/settings/integrations).

:::note API token save directory
The command will store the API token and other sensitive information to `~/.apify`.
:::

### Push the Actor to the Apify Cloud

```bash showLineNumbers
apify push
```

This command uploads your project to the Apify cloud and builds an Actor from it. On the platform, Actor needs to be built before it can be run.

### Run an Actor on the Apify Cloud

```bash showLineNumbers
apify call
```

Runs the Actor corresponding to the current directory on the Apify Platform.

This command can also be used to run other Actors, for example:

```bash showLineNumbers
apify call apify/hello-world
```

### So what's in this `.actor/actor.json` File?

This file associates your local development project with an Actor on the Apify Platform.
It contains information such as Actor name, version, build tag and environment variables.
Make sure you commit this file to the Git repository.

For example, `.actor/actor.json` file can look as follows:

```json showLineNumbers
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
    "dataset": "./dataset_schema.json",
  }
}
```

**`Dockerfile` field**

If you specify the path to your Docker file under the `dockerfile` field, this file will be used for Actor builds on the platform. If not specified, the system will look for Docker files at `.actor/Dockerfile` and `Dockerfile` in this order of preference.

**`Readme` field**

If you specify the path to your readme file under the `readme` field, the readme at this path will be used on the platform. If not specified, readme at `.actor/README.md` and `README.md` will be used in this order of preference.

**`Input` field**

You can embed your [input schema](https://docs.apify.com/actors/development/input-schema#specification-version-1) object directly in `actor.json` under `input` field. Alternatively, you can provide a path to a custom input schema. If not provided, the input schema at `.actor/INPUT_SCHEMA.json` and `INPUT_SCHEMA.json` is used in this order of preference.

**`Storages.dataset` field**

You can define the schema of the items in your dataset under the `storages.dataset` field. This can be either an embedded object or a path to a JSON schema file. You can read more about the schema of your Actor output [here](https://docs.apify.com/actors/development/output-schema#specification-version-1).

:::note Migration from deprecated config "apify.json"
Note that previously, Actor config was stored in the `apify.json` file that has been deprecated. You can find the (very slight) differences and migration info in [migration guidelines](https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md).
:::
