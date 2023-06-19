---
title: Command reference
---

This section contains printouts of `apify help` for all commands.

<!-- commands -->
* [`apify actor`](#apify-actor)
* [`apify actor:get-input`](#apify-actorget-input)
* [`apify actor:get-value KEY`](#apify-actorget-value-key)
* [`apify actor:push-data [ITEM]`](#apify-actorpush-data-item)
* [`apify actor:set-value KEY [VALUE]`](#apify-actorset-value-key-value)
* [`apify call [ACTID]`](#apify-call-actid)
* [`apify create [ACTORNAME]`](#apify-create-actorname)
* [`apify info`](#apify-info)
* [`apify init [ACTORNAME]`](#apify-init-actorname)
* [`apify login`](#apify-login)
* [`apify logout`](#apify-logout)
* [`apify pull [ACTORID]`](#apify-pull-actorid)
* [`apify push [ACTORID]`](#apify-push-actorid)
* [`apify run`](#apify-run)
* [`apify secrets`](#apify-secrets)
* [`apify secrets:add NAME VALUE`](#apify-secretsadd-name-value)
* [`apify secrets:rm NAME`](#apify-secretsrm-name)
* [`apify vis [PATH]`](#apify-vis-path)

## `apify actor`

Commands are designed to be used in actor runs. All commands are in PoC state, do not use in production environments.

```
USAGE
  $ apify actor
```

_See code: [src/commands/actor/index.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/actor/index.js)_

## `apify actor:get-input`

Gets the actor input value from the default key-value store associated with the actor run.

```
USAGE
  $ apify actor:get-input
```

_See code: [src/commands/actor/get-input.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/actor/get-input.js)_

## `apify actor:get-value KEY`

Gets a value from the default key-value store associated with the actor run.

```
USAGE
  $ apify actor:get-value KEY

ARGUMENTS
  KEY  Key of the record in key-value store
```

_See code: [src/commands/actor/get-value.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/actor/get-value.js)_

## `apify actor:push-data [ITEM]`

Stores an object or an array of objects to the default dataset of the actor run.

```
USAGE
  $ apify actor:push-data [ITEM]

ARGUMENTS
  ITEM  JSON string with one object or array of objects containing data to be stored in the default dataset.

DESCRIPTION
  It is possible to pass data using item argument or stdin.
  Passing data using argument:
  $ apify actor:push-data {"foo": "bar"}
  Passing data using stdin with pipe:
  $ cat ./test.json | apify actor:push-data
```

_See code: [src/commands/actor/push-data.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/actor/push-data.js)_

## `apify actor:set-value KEY [VALUE]`

Sets or removes record into the default KeyValueStore associated with the actor run.

```
USAGE
  $ apify actor:set-value KEY [VALUE]

ARGUMENTS
  KEY    Key of the record in key-value store.

  VALUE  Record data, which can be one of the following values:
         - If empty, the record in the key-value store is deleted.
         - If no `contentType` flag is specified, value is expected to be any JSON string value.
         - If options.contentType is set, value is taken as is.

OPTIONS
  -c, --contentType=contentType  Specifies a custom MIME content type of the record. By default "application/json" is
                                 used.

DESCRIPTION
  It is possible to pass data using argument or stdin.
  Passing data using argument:
  $ apify actor:set-value KEY my-value
  Passing data using stdin with pipe:
  $ cat ./my-text-file.txt | apify actor:set-value KEY --contentType text/plain
```

_See code: [src/commands/actor/set-value.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/actor/set-value.js)_

## `apify call [ACTID]`

Runs a specific actor remotely on the Apify cloud platform.

```
USAGE
  $ apify call [ACTID]

ARGUMENTS
  ACTID  Name or ID of the actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the command
         runs the remote actor specified in the ".actor/actor.json" file.

OPTIONS
  -b, --build=build                      Tag or number of the build to run (e.g. "latest" or "1.2.34").
  -m, --memory=memory                    Amount of memory allocated for the actor run, in megabytes.
  -t, --timeout=timeout                  Timeout for the actor run in seconds. Zero value means there is no timeout.
  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to run to finish, if no value passed, it waits forever.

DESCRIPTION
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/call.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/call.js)_

## `apify create [ACTORNAME]`

Creates a new actor project directory from a selected boilerplate template.

```
USAGE
  $ apify create [ACTORNAME]

ARGUMENTS
  ACTORNAME  Name of the actor and its directory

OPTIONS
  -t, --template=template    Template for the actor. If not provided, the command will prompt for it.
                             Visit
                             https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json to
                             find available template names.

  --skip-dependency-install  Skip installing actor dependencies.
```

_See code: [src/commands/create.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/create.js)_

## `apify info`

Displays information about the currently active Apify account.

```
USAGE
  $ apify info

DESCRIPTION
  The information is printed to the console.
```

_See code: [src/commands/info.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/info.js)_

## `apify init [ACTORNAME]`

Initializes a new actor project in an existing directory.

```
USAGE
  $ apify init [ACTORNAME]

ARGUMENTS
  ACTORNAME  Name of the actor. If not provided, you will be prompted for it.

DESCRIPTION
  The command only creates the ".actor/actor.json" file and the "storage" directory in the current directory, but will
  not touch anything else.

  WARNING: The directory at "storage" will be overwritten if it already exists.
```

_See code: [src/commands/init.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/init.js)_

## `apify login`

Logs in to your Apify account using a provided API token.

```
USAGE
  $ apify login

OPTIONS
  -t, --token=token  [Optional] Apify API token

DESCRIPTION
  The API token and other account information is stored in the ~/.apify directory, from where it is read by all other
  "apify" commands. To log out, call "apify logout".
```

_See code: [src/commands/login.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/login.js)_

## `apify logout`

Logs out of your Apify account.

```
USAGE
  $ apify logout

DESCRIPTION
  The command deletes the API token and all other account information stored in the ~/.apify directory. To log in again,
   call "apify login".
```

_See code: [src/commands/logout.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/logout.js)_

## `apify pull [ACTORID]`

Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be cloned. If it is defined as Web IDE, it will fetch the files.

```
USAGE
  $ apify pull [ACTORID]

ARGUMENTS
  ACTORID  Name or ID of the actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will update the Actor in the current directory based on its name in ".actor/actor.json" file.

OPTIONS
  -v, --version=version  Actor version number which will be pulled, e.g. 1.2. Default: the highest version
```

_See code: [src/commands/pull.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/pull.js)_

## `apify push [ACTORID]`

Uploads the actor to the Apify platform and builds it there.

```
USAGE
  $ apify push [ACTORID]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the actor with the name specified in ".actor/actor.json" file.

OPTIONS
  -b, --build-tag=build-tag              Build tag to be applied to the successful Actor build. By default, it is taken
                                         from the ".actor/actor.json" file

  -v, --version=version                  Actor version number to which the files should be pushed. By default, it is
                                         taken from the ".actor/actor.json" file.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to build to finish, if no value passed, it waits forever.

  --no-prompt                            Do not prompt for opening the actor details in a browser. This will also not
                                         open the browser automatically.

  --version-number=version-number        DEPRECATED: Use flag version instead. Actor version number to which the files
                                         should be pushed. By default, it is taken from the ".actor/actor.json" file.

DESCRIPTION
  The Actor settings are read from the ".actor/actor.json" file in the current directory, but they can be overridden
  using command-line options.
  NOTE: If the source files are smaller than 3 MB then they are uploaded as
  "Multiple source files", otherwise they are uploaded as "Zip file".

  WARNING: If the target Actor already exists in your Apify account, it will be overwritten!
```

_See code: [src/commands/push.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/push.js)_

## `apify run`

Runs the actor locally in the current directory.

```
USAGE
  $ apify run

OPTIONS
  -p, --purge              Shortcut that combines the --purge-queue, --purge-dataset and --purge-key-value-store
                           options.

  --purge-dataset          Deletes the local directory containing the default dataset before the run starts.

  --purge-key-value-store  Deletes all records from the default key-value store in the local directory before the run
                           starts, except for the "INPUT" key.

  --purge-queue            Deletes the local directory containing the default request queue before the run starts.

DESCRIPTION
  It sets various APIFY_XYZ environment variables in order to provide a working execution environment for the actor. For
   example, this causes the actor input, as well as all other data in key-value stores, datasets or request queues to be
   stored in the "storage" directory, rather than on the Apify platform.

  NOTE: You can override the command's default behavior for Node.js actors by overriding the "start" script in the
  package.json file. You can set up your own main file or environment variables by changing it.
```

_See code: [src/commands/run.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/run.js)_

## `apify secrets`

Manages secret values for actor environment variables.

```
USAGE
  $ apify secrets

DESCRIPTION
  Example:
  $ apify secrets:add mySecret TopSecretValue123

  Now the "mySecret" value can be used in an environment variable defined in ".actor/actor.json" file by adding the "@"
  prefix:

  {
    "actorSpecification": 1,
    "name": "my_actor",
    "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },
    "version": "0.1
  }

  When the actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is stored as a secret environment variable
   of the actor.
```

_See code: [src/commands/secrets/index.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/secrets/index.js)_

## `apify secrets:add NAME VALUE`

Adds a new secret value.

```
USAGE
  $ apify secrets:add NAME VALUE

ARGUMENTS
  NAME   Name of the secret
  VALUE  Value of the secret

DESCRIPTION
  The secrets are stored to a file at ~/.apify
```

_See code: [src/commands/secrets/add.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/secrets/add.js)_

## `apify secrets:rm NAME`

Removes the secret.

```
USAGE
  $ apify secrets:rm NAME

ARGUMENTS
  NAME  Name of the secret
```

_See code: [src/commands/secrets/rm.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/secrets/rm.js)_

## `apify vis [PATH]`

Validates input schema and prints errors found.

```
USAGE
  $ apify vis [PATH]

ARGUMENTS
  PATH  Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.

DESCRIPTION
  The input schema for the actor is used from these locations in order of preference.
  The first one found is validated as it would be the one used on the Apify platform.
  1. Directly embedded object in ".actor/actor.json" under 'input' key
  2. Path to JSON file referenced in ".actor/actor.json" under 'input' key
  3. JSON file at .actor/INPUT_SCHEMA.json
  4. JSON file at INPUT_SCHEMA.json

  You can also pass any custom path to your input schema to have it validated instead.
```

_See code: [src/commands/vis.js](https://github.com/apify/apify-cli/blob/v0.17.0/src/commands/vis.js)_
<!-- commandsstop -->
