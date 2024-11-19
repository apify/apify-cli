---
title: Command reference
---

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
* [`apify datasets ls`](#apify-datasets-ls)
* [`apify datasets push-items NAMEORID ITEM`](#apify-datasets-push-items-nameorid-item)
* [`apify datasets rename NAMEORID [NEWNAME]`](#apify-datasets-rename-nameorid-newname)
* [`apify datasets rm DATASETNAMEORID`](#apify-datasets-rm-datasetnameorid)
* [`apify help [COMMAND]`](#apify-help-command)
* [`apify info`](#apify-info)
* [`apify init [ACTORNAME]`](#apify-init-actorname)
* [`apify key-value-stores`](#apify-key-value-stores)
* [`apify key-value-stores create [KEYVALUESTORENAME]`](#apify-key-value-stores-create-keyvaluestorename)
* [`apify key-value-stores delete-value STOREID ITEMKEY`](#apify-key-value-stores-delete-value-storeid-itemkey)
* [`apify key-value-stores get-value KEYVALUESTOREID ITEMKEY`](#apify-key-value-stores-get-value-keyvaluestoreid-itemkey)
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

Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.

```
USAGE
  $ apify actor

DESCRIPTION
  Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.
```

_See code: [src/commands/actor/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actor/index.ts)_

## `apify actor get-input`

Gets the Actor input value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-input

DESCRIPTION
  Gets the Actor input value from the default key-value store associated with the Actor run.
```

_See code: [src/commands/actor/get-input.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actor/get-input.ts)_

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

_See code: [src/commands/actor/get-value.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actor/get-value.ts)_

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

_See code: [src/commands/actor/push-data.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actor/push-data.ts)_

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

_See code: [src/commands/actor/set-value.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actor/set-value.ts)_

## `apify actors`

Commands are designed to be used with Actors.

```
USAGE
  $ apify actors

DESCRIPTION
  Commands are designed to be used with Actors.
```

_See code: [src/commands/actors/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/index.ts)_

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

_See code: [src/commands/actors/build.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/build.ts)_

## `apify actors call [ACTORID]`

Runs a specific Actor remotely on the Apify cloud platform.

```
USAGE
  $ apify actors call [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>] [-s] [-o]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the ".actor/actor.json" file.

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
  Runs a specific Actor remotely on the Apify cloud platform.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/actors/call.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/call.ts)_

## `apify actors ls`

Lists all recently ran Actors or your own Actors.

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
  Lists all recently ran Actors or your own Actors.
```

_See code: [src/commands/actors/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/ls.ts)_

## `apify actors pull [ACTORID]`

Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be cloned. If it is defined as Web IDE, it will fetch the files.

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
  Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be
  cloned. If it is defined as Web IDE, it will fetch the files.
```

_See code: [src/commands/actors/pull.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/pull.ts)_

## `apify actors push [ACTORID]`

Uploads the Actor to the Apify platform and builds it there.

```
USAGE
  $ apify actors push [ACTORID] [-v <value>] [-b <value>] [-w <value>] [--no-prompt] [--force] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the Actor with the name specified in ".actor/actor.json" file.

FLAGS
  -b, --build-tag=<value>        Build tag to be applied to the successful Actor build. By default, it is taken from the
                                 ".actor/actor.json" file
  -v, --version=<value>          Actor version number to which the files should be pushed. By default, it is taken from
                                 the ".actor/actor.json" file.
  -w, --wait-for-finish=<value>  Seconds for waiting to build to finish, if no value passed, it waits forever.
      --dir=<value>              Directory where the Actor is located
      --force                    Push an Actor even when the local files are older than the Actor on the platform.
      --no-prompt                Do not prompt for opening the Actor details in a browser. This will also not open the
                                 browser automatically.

DESCRIPTION
  Uploads the Actor to the Apify platform and builds it there.
  The Actor settings are read from the ".actor/actor.json" file in the current directory, but they can be overridden
  using command-line options.
  NOTE: If the source files are smaller than 3 MB then they are uploaded as
  "Multiple source files", otherwise they are uploaded as "Zip file".

  When there's an attempt to push files that are older than the Actor on the platform, the command will fail. Can be
  overwritten with --force flag.
```

_See code: [src/commands/actors/push.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/push.ts)_

## `apify actors rm ACTORID`

Deletes an Actor.

```
USAGE
  $ apify actors rm ACTORID

ARGUMENTS
  ACTORID  The Actor ID to delete.

DESCRIPTION
  Deletes an Actor.
```

_See code: [src/commands/actors/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/rm.ts)_

## `apify actors start [ACTORID]`

Runs a specific Actor remotely on the Apify cloud platform and immediately returns information about the run.

```
USAGE
  $ apify actors start [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the ".actor/actor.json" file.

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
  Runs a specific Actor remotely on the Apify cloud platform and immediately returns information about the run.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/actors/start.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/actors/start.ts)_

## `apify builds`

Commands are designed to be used with Actor Builds.

```
USAGE
  $ apify builds

DESCRIPTION
  Commands are designed to be used with Actor Builds.
```

_See code: [src/commands/builds/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/index.ts)_

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

_See code: [src/commands/builds/create.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/create.ts)_

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

_See code: [src/commands/builds/info.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/info.ts)_

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

_See code: [src/commands/builds/log.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/log.ts)_

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

_See code: [src/commands/builds/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/ls.ts)_

## `apify builds rm BUILDID`

Deletes an Actor Build.

```
USAGE
  $ apify builds rm BUILDID

ARGUMENTS
  BUILDID  The build ID to delete.

DESCRIPTION
  Deletes an Actor Build.
```

_See code: [src/commands/builds/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/builds/rm.ts)_

## `apify call [ACTORID]`

Runs a specific Actor remotely on the Apify cloud platform.

```
USAGE
  $ apify call [ACTORID] [--json] [-b <value>] [-t <value>] [-m <value>] [-i <value> | --input-file
    <value>] [-s] [-o]

ARGUMENTS
  ACTORID  Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not
           provided, the command runs the remote Actor specified in the ".actor/actor.json" file.

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
  Runs a specific Actor remotely on the Apify cloud platform.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/call.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/call.ts)_

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

_See code: [src/commands/create.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/create.ts)_

## `apify datasets`

Commands are designed to be used with Datasets.

```
USAGE
  $ apify datasets

DESCRIPTION
  Commands are designed to be used with Datasets.
```

_See code: [src/commands/datasets/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/index.ts)_

## `apify datasets create [DATASETNAME]`

Creates a new Dataset on your account

```
USAGE
  $ apify datasets create [DATASETNAME] [--json]

ARGUMENTS
  DATASETNAME  Optional name for the Dataset

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new Dataset on your account
```

_See code: [src/commands/datasets/create.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/create.ts)_

## `apify datasets get-items DATASETID`

Exports the items present in a Dataset.

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
  Exports the items present in a Dataset.
```

_See code: [src/commands/datasets/get-items.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/get-items.ts)_

## `apify datasets ls`

Lists all Datasets on your account.

```
USAGE
  $ apify datasets ls [--json] [--offset <value>] [--limit <value>] [--desc] [--unnamed]

FLAGS
  --desc            Sorts Datasets in descending order.
  --limit=<value>   [default: 20] Number of Datasets that will be listed.
  --offset=<value>  Number of Datasets that will be skipped.
  --unnamed         Lists Datasets that don't have a name set.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all Datasets on your account.
```

_See code: [src/commands/datasets/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/ls.ts)_

## `apify datasets push-items NAMEORID ITEM`

Pushes an object or an array of objects to the provided Dataset.

```
USAGE
  $ apify datasets push-items NAMEORID ITEM

ARGUMENTS
  NAMEORID  The Dataset ID or name to push the objects to
  ITEM      The object or array of objects to be pushed.

DESCRIPTION
  Pushes an object or an array of objects to the provided Dataset.
```

_See code: [src/commands/datasets/push-items.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/push-items.ts)_

## `apify datasets rename NAMEORID [NEWNAME]`

Renames a Dataset, or removes its unique name

```
USAGE
  $ apify datasets rename NAMEORID [NEWNAME] [--unname]

ARGUMENTS
  NAMEORID  The Dataset ID or name to delete
  NEWNAME   The new name for the Dataset

FLAGS
  --unname  Removes the unique name of the Dataset

DESCRIPTION
  Renames a Dataset, or removes its unique name
```

_See code: [src/commands/datasets/rename.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/rename.ts)_

## `apify datasets rm DATASETNAMEORID`

Deletes a Dataset

```
USAGE
  $ apify datasets rm DATASETNAMEORID

ARGUMENTS
  DATASETNAMEORID  The Dataset ID or name to delete

DESCRIPTION
  Deletes a Dataset
```

_See code: [src/commands/datasets/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/datasets/rm.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.16/src/commands/help.ts)_

## `apify info`

Displays information about the currently active Apify account.

```
USAGE
  $ apify info

DESCRIPTION
  Displays information about the currently active Apify account.
  The information is printed to the console.
```

_See code: [src/commands/info.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/info.ts)_

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

_See code: [src/commands/init.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/init.ts)_

## `apify key-value-stores`

Commands are designed to be used with Key Value Stores.

```
USAGE
  $ apify key-value-stores

DESCRIPTION
  Commands are designed to be used with Key Value Stores.

  Aliases: kvs
```

_See code: [src/commands/key-value-stores/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/index.ts)_

## `apify key-value-stores create [KEYVALUESTORENAME]`

Creates a new Key-value store on your account

```
USAGE
  $ apify key-value-stores create [KEYVALUESTORENAME] [--json]

ARGUMENTS
  KEYVALUESTORENAME  Optional name for the Key-value store

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Creates a new Key-value store on your account
```

_See code: [src/commands/key-value-stores/create.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/create.ts)_

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

_See code: [src/commands/key-value-stores/delete-value.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/delete-value.ts)_

## `apify key-value-stores get-value KEYVALUESTOREID ITEMKEY`

Gets a value by key in the given key-value store.

```
USAGE
  $ apify key-value-stores get-value KEYVALUESTOREID ITEMKEY [--only-content-type]

ARGUMENTS
  KEYVALUESTOREID  The key-value store ID to get the value from.
  ITEMKEY          The key of the item in the key-value store.

FLAGS
  --only-content-type  Only return the content type of the specified key

DESCRIPTION
  Gets a value by key in the given key-value store.
```

_See code: [src/commands/key-value-stores/get-value.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/get-value.ts)_

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

_See code: [src/commands/key-value-stores/keys.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/keys.ts)_

## `apify key-value-stores ls`

Lists all Key-value stores on your account.

```
USAGE
  $ apify key-value-stores ls [--json] [--offset <value>] [--limit <value>] [--desc] [--unnamed]

FLAGS
  --desc            Sorts Key-value stores in descending order.
  --limit=<value>   [default: 20] Number of Key-value stores that will be listed.
  --offset=<value>  Number of Key-value stores that will be skipped.
  --unnamed         Lists Key-value stores that don't have a name set.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Lists all Key-value stores on your account.
```

_See code: [src/commands/key-value-stores/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/ls.ts)_

## `apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME]`

Renames a Key-value store, or removes its unique name

```
USAGE
  $ apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME] [--unname]

ARGUMENTS
  KEYVALUESTORENAMEORID  The Key-value store ID or name to delete
  NEWNAME                The new name for the Key-value store

FLAGS
  --unname  Removes the unique name of the Key-value store

DESCRIPTION
  Renames a Key-value store, or removes its unique name
```

_See code: [src/commands/key-value-stores/rename.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/rename.ts)_

## `apify key-value-stores rm KEYVALUESTORENAMEORID`

Deletes a Key-value store

```
USAGE
  $ apify key-value-stores rm KEYVALUESTORENAMEORID

ARGUMENTS
  KEYVALUESTORENAMEORID  The Key-value store ID or name to delete

DESCRIPTION
  Deletes a Key-value store
```

_See code: [src/commands/key-value-stores/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/rm.ts)_

## `apify key-value-stores set-value STOREID ITEMKEY [VALUE]`

Sets a value in a key-value store.

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
  Sets a value in a key-value store.
```

_See code: [src/commands/key-value-stores/set-value.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/key-value-stores/set-value.ts)_

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

_See code: [src/commands/login.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/login.ts)_

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

_See code: [src/commands/logout.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/logout.ts)_

## `apify pull [ACTORID]`

Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be cloned. If it is defined as Web IDE, it will fetch the files.

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
  Pulls an Actor from the Apify platform to the current directory. If it is defined as Git repository, it will be
  cloned. If it is defined as Web IDE, it will fetch the files.
```

_See code: [src/commands/pull.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/pull.ts)_

## `apify push [ACTORID]`

Uploads the Actor to the Apify platform and builds it there.

```
USAGE
  $ apify push [ACTORID] [-v <value>] [-b <value>] [-w <value>] [--no-prompt] [--force] [--dir <value>]

ARGUMENTS
  ACTORID  Name or ID of the Actor to push (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command will create or modify the Actor with the name specified in ".actor/actor.json" file.

FLAGS
  -b, --build-tag=<value>        Build tag to be applied to the successful Actor build. By default, it is taken from the
                                 ".actor/actor.json" file
  -v, --version=<value>          Actor version number to which the files should be pushed. By default, it is taken from
                                 the ".actor/actor.json" file.
  -w, --wait-for-finish=<value>  Seconds for waiting to build to finish, if no value passed, it waits forever.
      --dir=<value>              Directory where the Actor is located
      --force                    Push an Actor even when the local files are older than the Actor on the platform.
      --no-prompt                Do not prompt for opening the Actor details in a browser. This will also not open the
                                 browser automatically.

DESCRIPTION
  Uploads the Actor to the Apify platform and builds it there.
  The Actor settings are read from the ".actor/actor.json" file in the current directory, but they can be overridden
  using command-line options.
  NOTE: If the source files are smaller than 3 MB then they are uploaded as
  "Multiple source files", otherwise they are uploaded as "Zip file".

  When there's an attempt to push files that are older than the Actor on the platform, the command will fail. Can be
  overwritten with --force flag.
```

_See code: [src/commands/push.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/push.ts)_

## `apify request-queues`

Commands are designed to be used with Request Queues.

```
USAGE
  $ apify request-queues

DESCRIPTION
  Commands are designed to be used with Request Queues.
```

_See code: [src/commands/request-queues/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/request-queues/index.ts)_

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

_See code: [src/commands/run.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/run.ts)_

## `apify runs`

Commands are designed to be used with Actor Runs.

```
USAGE
  $ apify runs

DESCRIPTION
  Commands are designed to be used with Actor Runs.
```

_See code: [src/commands/runs/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/index.ts)_

## `apify runs abort RUNID`

Aborts an Actor Run.

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
  Aborts an Actor Run.
```

_See code: [src/commands/runs/abort.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/abort.ts)_

## `apify runs info RUNID`

Prints information about an Actor Run.

```
USAGE
  $ apify runs info RUNID [--json] [-v]

ARGUMENTS
  RUNID  The run ID to print information about.

FLAGS
  -v, --verbose  Prints more in-depth information about the Actor Run.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints information about an Actor Run.
```

_See code: [src/commands/runs/info.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/info.ts)_

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

_See code: [src/commands/runs/log.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/log.ts)_

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

_See code: [src/commands/runs/ls.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/ls.ts)_

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

_See code: [src/commands/runs/resurrect.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/resurrect.ts)_

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

_See code: [src/commands/runs/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/runs/rm.ts)_

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

_See code: [src/commands/secrets/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/secrets/index.ts)_

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

_See code: [src/commands/secrets/add.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/secrets/add.ts)_

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

_See code: [src/commands/secrets/rm.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/secrets/rm.ts)_

## `apify task`

Commands are designed to be used to interact with Tasks.

```
USAGE
  $ apify task

DESCRIPTION
  Commands are designed to be used to interact with Tasks.
```

_See code: [src/commands/task/index.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/task/index.ts)_

## `apify task run TASKID`

Runs a specific Actor remotely on the Apify cloud platform.

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
  Runs a specific Actor remotely on the Apify cloud platform.
  The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". It
  takes input for the Actor from the default local key-value store by default.
```

_See code: [src/commands/task/run.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/task/run.ts)_

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

_See code: [src/commands/validate-schema.ts](https://github.com/apify/apify-cli/blob/v0.21.0/src/commands/validate-schema.ts)_
<!-- commandsstop -->
<!-- prettier-ignore-end -->
