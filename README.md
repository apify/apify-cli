# Apify command line client (apify-cli)

<a href="http://badge.fury.io/js/apify-cli"><img src="https://badge.fury.io/js/apify-cli.svg" alt="npm version" style="display:inherit;"></a>
<a href="https://travis-ci.org/apifytech/apify-cli?branch=master"><img src="https://travis-ci.org/apifytech/apify-js.svg" alt="Build Status" style="display:inherit;"></a>

Apify command line client (CLI) helps you to create, develop, build and run
[Apify actors](https://www.apify.com/docs/actor) from a local computer.

Apify actors enable the execution of arbitrary web scraping and automation jobs in the Apify cloud.

While you can develop actors in a code editor directly in the [Apify web application](https://my.apify.com/),
for more complex projects it is more convenient to develop actors locally
using the <a href="https://github.com/apifytech/apify-js">Apify SDK</a>
and only push them to the Apify cloud for execution.
This is where the CLI comes in.

Note that actors running on the Apify platform are executed in Docker containers, so with an appropriate `Dockerfile`
you can build your actors in any programming language.
However, we recommend using JavaScript / Node.js, for which we provide most libraries and support.


## Installation

First, make sure you have [Node.js](https://nodejs.org) version 8 or higher installed on your computer:

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
i.e. it will create the `apify.json` file and `apify_storage` directory.

Before you can run your project using `apify run`, you have to set up the right start command in `package.json` under scripts.start. For example:
```json
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

Before you can interact with the Apify cloud, you need to [create an Apify account](https://my.apify.com/)
and log in to it using the above command. You will be prompted for
your [Apify API token](https://my.apify.com/account#/integrations).
Note that the command will store the API token and other sensitive information to `~/.apify`.


### Push the actor to the Apify cloud

```bash
apify push
```

This command creates a ZIP archive with your project, uploads it to the Apify cloud and builds an actor from it.

### Run an actor on the Apify cloud

```bash
apify call
```

Runs the actor corresponding to the current directory on the Apify platform.

This command can also be used to run other actors, for example:

```bash
apify call apify/hello-world
```

### So what's in this `apify.json` file?

This file associates your local development project with an actor on the Apify platform.
It contains information such as actor name or ID, version and build tag.
Make sure you commit this file to the Git repository.


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


<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->

```text
Apify command line client to help you create, develop, build and run Apify actors.

VERSION
  apify-cli/0.2.0 darwin-x64 node-v8.4.0

USAGE
  $ apify [COMMAND]

COMMANDS
  call    Runs the actor remotely on the Apify platform.
  create  Creates a new actor project directory from a selected template.
  info    Displays information about current Apify settings.
  init    Initializes an actor project in an existing directory.
  login   Logs in to the Apify platform using the API token.
  logout  Logs out of the Apify platform.
  push    Uploads the actor to the Apify platform and builds it there.
  run     Runs the actor locally in the current directory by executing "npm
          start".

```
### apify call
```text
Runs the actor remotely on the Apify platform.

USAGE
  $ apify call [ACTID]

ARGUMENTS
  ACTID  Name or ID of the actor to run (e.g. "apify/hello-world" or
         "E2jjCZBezvAZnX8Rb"). If not provided, the command runs the remote
         actor specified in the "apify.json" file.

OPTIONS
  -b, --build=build                      Tag or number of the build to run (e.g.
                                         "latest" or "1.2.34").

  -m, --memory=memory                    Amount of memory allocated for the
                                         actor run, in megabytes.

  -t, --timeout=timeout                  Timeout for the actor run in seconds.
                                         Zero value means there is no timeout.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to run to finish,
                                         if no value passed, it waits forever.

DESCRIPTION
  The actor is run under your current Apify account, therefore you need to be
  logged in by calling "apify login". It takes input for the actor from the
  default local key-value store by default.

```
### apify create
```text
Creates a new actor project directory from a selected template.

USAGE
  $ apify create ACTNAME

ARGUMENTS
  ACTNAME  Name of the actor and its directory

OPTIONS
  -t, --template=basic|puppeteer|puppeteer_crawler|plain_request_urls_list
      Template for the actor. If not provided, the command will prompt for it.

```
### apify info
```text
Displays information about current Apify settings.

USAGE
  $ apify info

DESCRIPTION
  This command prints information about Apify to the console.

```
### apify init
```text
Initializes an actor project in an existing directory.

USAGE
  $ apify init [ACTNAME]

ARGUMENTS
  ACTNAME  Name of the actor. If not provided, you will be prompted for it.

DESCRIPTION
  The command only creates the "apify.json" file and the "apify_storage"
  directory in the current directory, but will not touch anything else.

  WARNING: If the files already exist, they will be overwritten!

```
### apify login
```text
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
```text
Logs out of the Apify platform.

USAGE
  $ apify logout

DESCRIPTION
  The command deletes the API token and all other account information stored in
  the ~/.apify directory. To log in again, call "apify login".

```
### apify push
```text
Uploads the actor to the Apify platform and builds it there.

USAGE
  $ apify push [ACTID]

ARGUMENTS
  ACTID  ID of an existing actor on the Apify platform where the files will be
         pushed. If not provided, the command will create or modify the actor
         with the name specified in "apify.json" file.

OPTIONS
  -b, --build-tag=build-tag              Build tag to be applied to the
                                         successful actor build. By default, it
                                         is taken from the "apify.json" file

  -v, --version-number=version-number    Actor version number to which the files
                                         should be pushed. By default, it is
                                         taken from the "apify.json" file.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to build to finish,
                                         if no value passed, it waits forever.

DESCRIPTION
  The command creates a ZIP with files of the actor from the current directory,
  uploads it to the Apify platform and builds it. The actor settings are read
  from the "apify.json" file in the current directory, but they can be
  overridden using command-line options.

  WARNING: If the target actor already exists in your Apify account, it will be
  overwritten!

```
### apify run
```text
Runs the actor locally in the current directory by executing "npm start".

USAGE
  $ apify run

OPTIONS
  -p, --purge              Shortcut that combines the --purge-queue,
                           --purge-dataset and --purge-key-value-store options.

  --purge-dataset          Deletes the local directory containing the default
                           dataset before the run starts.

  --purge-key-value-store  Deletes all records from the default key-value store
                           in the local directory before the run starts, except
                           for the "INPUT" key.

  --purge-queue            Deletes the local directory containing the default
                           request queue before the run starts.

DESCRIPTION
  It sets various APIFY_XYZ environment variables in order to provide a working
  execution environment for the actor. For example, this causes the actor input,
  as well as all other data in key-value stores, datasets or request queues to
  be stored in the "apify_storage" directory, rather than on the Apify platform.

  NOTE: You can override the default behaviour of command overriding npm start
  script value in a package.json file. You can set up your own main file or
  environment variables by changing it.

```

<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->






