# Apify command line client (apify-cli)

[![npm version](https://badge.fury.io/js/apify-cli.svg)](http://badge.fury.io/js/apify-cli)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-cli)

Apify command client client (CLI) helps you to create, develop, build and run
[Apify Actor](https://www.apify.com/docs/actor) acts from a local computer.

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

This command will only setup local act development environment in an existing directory,
i.e. it will create the `apify.json` file and `apify_local` directory.

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
Apify command line client to help you create, develop, build and run Actor acts.

VERSION
  apify-cli/0.1.3 darwin-x64 node-v8.9.4

USAGE
  $ apify [COMMAND]

COMMANDS
  call    Runs the act remotely on the Apify platform.
  create  Creates a new act project directory from a selected template.
  info    Displays information about Apify current settings.
  init    Initializes an act project in an existing directory.
  login   Logs in to the Apify platform using the API token.
  logout  Logs out of the Apify platform.
  push    Uploads the act to the Apify platform and builds it there.
  run     Runs the act locally in the current directory.

```
### apify call
```
Runs the act remotely on the Apify platform.

USAGE
  $ apify call [ACTID]

ARGUMENTS
  ACTID  Name or ID of the act to run (e.g. "apify/hello-world" or
         "E2jjCZBezvAZnX8Rb"). If not provided, the command runs the remote act
         specified in the "apify.json" file.

OPTIONS
  -b, --build=build      Tag or number of the build to run (e.g. "latest" or
                         "1.2.34").

  -m, --memory=memory    Amount of memory allocated for the act run, in
                         megabytes.

  -t, --timeout=timeout  Timeout for the act run in seconds. Zero value means
                         there is no timeout.

DESCRIPTION
  The act is run under your current Apify account, therefore you need to be
  logged in by calling "apify login".

```
### apify create
```
Creates a new act project directory from a selected template.

USAGE
  $ apify create ACTNAME

ARGUMENTS
  ACTNAME  Name of the act and its directory

OPTIONS
  -t, --template=basic|puppeteer|puppeteer_crawler|plain_request_urls_list
      Template for the act. If not provided, the command will prompt for it.

```
### apify info
```
Displays information about Apify current settings.

USAGE
  $ apify info

DESCRIPTION
  This command prints information about Apify to console.

```
### apify init
```
Initializes an act project in an existing directory.

USAGE
  $ apify init [ACTNAME]

ARGUMENTS
  ACTNAME  Name of the act. If not provided, you will be prompted for it.

DESCRIPTION
  The command only creates the "apify.json" file and the "apify_local" directory
  in the current directory, but will not touch anything else.

  WARNING: If the files already exist, they will be overwritten!

```
### apify login
```
Logs in to the Apify platform using the API token.

USAGE
  $ apify login

OPTIONS
  -t, --token=token  [Optional] Apify API token

DESCRIPTION
  The token and other account information is stored to the ~/.apify directory,
  from where it is read by all other "apify" commands. To log out, call "apify
  logout".

```
### apify logout
```
Logs out of the Apify platform.

USAGE
  $ apify logout

DESCRIPTION
  The command deletes the API token and all other account information stored in
  the ~/.apify directory. To log in again, call "apify login".

```
### apify push
```
Uploads the act to the Apify platform and builds it there.

USAGE
  $ apify push [ACTID]

ARGUMENTS
  ACTID  ID of an existing act on the Apify platform where the files will be
         pushed. If not provided, the command will create or modify the act with
         the name specified in "apify.json" file.

OPTIONS
  -b, --build-tag=build-tag            Build tag to be applied to the successful
                                       act build. By default, it is taken from
                                       the "apify.json" file

  -v, --version-number=version-number  Act version number to which the files
                                       should be pushed. By default, it is taken
                                       from the "apify.json" file.

DESCRIPTION
  The command creates a ZIP with files of the act from the current directory,
  uploads it to the Apify platform and builds it. The act settings are read from
  the "apify.json" file in the current directory, but they can be overridden
  using command-line options.

  WARNING: If the target act already exists in your Apify account, it will be
  overwritten!

```
### apify run
```
Runs the act locally in the current directory.

USAGE
  $ apify run

DESCRIPTION
  The command runs a Node.js process with the act in the current directory. It
  sets various APIFY_XYZ environment variablesin order to provide a working
  execution environment for the act. For example, this causes the act input, as
  well as all other data in key-value stores, datasets or request queues to be
  stored in the "apify_local" directory,rather than on the Apify platform.

```

<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->

