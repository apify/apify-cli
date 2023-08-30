---
sidebar_label: Installation
title: Installation
---

## Via Homebrew

On macOS (or Linux), you can install the Apify CLI via the [Homebrew package manager](https://brew.sh).

```bash
brew install apify-cli
```

## Via NPM

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

Alternativaly, you can use [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) and install Apify CLI only into a selected user-level Node version without requiring root privileges:

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

## Basic usage

The following examples demonstrate the basic usage of Apify CLI.

### Create a new actor from scratch

```bash
apify create my-hello-world
```

First, you will be prompted to select a template with the boilerplate for the actor, to help you get started quickly.
The command will create a directory called `my-hello-world` that contains a Node.js project
for the actor and a few configuration files.

### Create a new actor from existing project

```bash
cd ./my/awesome/project
apify init
```
This command will only set up local actor development environment in an existing directory,
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

### Run the actor locally

```bash
cd my-hello-world
apify run
```

This command runs the actor on your local machine.
Now's your chance to develop the logic - or magic :smirk:

### Login with your Apify account

```bash
apify login
```

Before you can interact with the Apify cloud, you need to [create an Apify account](https://console.apify.com/)
and log in to it using the above command. You will be prompted for
your [Apify API token](https://console.apify.com/account#/integrations).
Note that the command will store the API token and other sensitive information to `~/.apify`.


### Push the actor to the Apify cloud

```bash
apify push
```

This command uploads your project to the Apify cloud and builds an actor from it. On the platform, actor needs to be built before it can be run.

### Run an actor on the Apify cloud

```bash
apify call
```

Runs the actor corresponding to the current directory on the Apify platform.

This command can also be used to run other actors, for example:

```bash
apify call apify/hello-world
```

### So what's in this `.actor/actor.json` file?

This file associates your local development project with an actor on the Apify platform.
It contains information such as actor name, version, build tag and environment variables.
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
    "dataset": "./dataset_schema.json",
  }
}
```

**`Dockerfile` field**

If you specify the path to your Docker file under the `dockerfile` field, this file will be used for actor builds on the platform. If not specified, the system will look for Docker files at `.actor/Dockerfile` and `Dockerfile` in this order of preference.

**`Readme` field**

If you specify the path to your readme file under the `readme` field, the readme at this path will be used on the platform. If not specified, readme at `.actor/README.md` and `README.md` will be used in this order of preference.

**`Input` field**

You can embed your [input schema](https://docs.apify.com/actors/development/input-schema#specification-version-1) object directly in `actor.json` under `input` field. Alternatively, you can provide a path to a custom input schema. If not provided, the input schema at `.actor/INPUT_SCHEMA.json` and `INPUT_SCHEMA.json` is used in this order of preference.

**`Storages.dataset` field**

You can define the schema of the items in your dataset under the `storages.dataset` field. This can be either an embedded object or a path to a JSON schema file. You can read more about the schema of your actor output [here](https://docs.apify.com/actors/development/output-schema#specification-version-1).

**Note on migration from deprecated config "apify.json"**

*Note that previously, actor config was stored in the `apify.json` file that has been deprecated. You can find the (very slight) differences and migration info in [migration guidelines](https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md).*
