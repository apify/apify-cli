---
title: Apify CLI Reference Documentation
sidebar_label: Command reference
toc_max_heading_level: 4
---

The Apify CLI provides tools for managing your Apify projects and resources from the command line. Use these commands to develop Actors locally, deploy them to Apify platform, manage storage, orchestrate runs, and handle account configuration.

This reference guide documents available commands, their options, and common usage patterns, to efficiently work with Apify platform.

### General

The general commands provide basic functionality for getting help and information about the Apify CLI.

<!-- prettier-ignore-start -->
<!-- general-commands-start -->
##### `apify help [COMMAND]`

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
<!-- general-commands-end -->
<!-- prettier-ignore-end -->

### Authentication & Account Management

Use these commands to manage your Apify account authentication, access tokens, and configuration settings. These commands control how you interact with Apify platform and manage sensitive information.

<!-- prettier-ignore-start -->
<!-- auth-commands-start -->
##### `apify login`

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

##### `apify logout`

Removes authentication by deleting your API token and account information from '~/.apify'.

```
USAGE
  $ apify logout

DESCRIPTION
  Removes authentication by deleting your API token and account information from '~/.apify'.
  Run 'apify login' to authenticate again.
```

##### `apify info`

Prints details about your currently authenticated Apify account.

```
USAGE
  $ apify info

DESCRIPTION
  Prints details about your currently authenticated Apify account.
```

##### `apify secrets`

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

##### `apify secrets add NAME VALUE`

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

##### `apify secrets rm NAME`

Permanently deletes a secret from your stored credentials.

```
USAGE
  $ apify secrets rm NAME

ARGUMENTS
  NAME  Name of the secret

DESCRIPTION
  Permanently deletes a secret from your stored credentials.
```
<!-- auth-commands-end -->
<!-- prettier-ignore-end -->

### Actor Development

These commands help you develop Actors locally. Use them to create new Actor projects, initialize configurations, run Actors in development mode, and validate input schemas.

<!-- prettier-ignore-start -->
<!-- actor-dev-commands-start -->
##### `apify create [ACTORNAME]`

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

##### `apify init [ACTORNAME]`

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

##### `apify run`

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

##### `apify validate-schema [PATH]`

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
<!-- actor-dev-commands-end -->
<!-- prettier-ignore-end -->

### Actor Management

These commands let you manage Actors on Apify platform. They provide functionality for deployment, execution, monitoring, and maintenance of your Actors in the cloud environment.

#### Basic Actor Operations

Use these commands to handle core Actor operations like creation, listing, deletion, and basic runtime management. These are the essential commands for working with Actors on Apify platform.

<!-- prettier-ignore-start -->
<!-- actor-basic-commands-start -->
##### `apify actors`

Manages Actor creation, deployment, and execution on the Apify platform.

```
USAGE
  $ apify actors

DESCRIPTION
  Manages Actor creation, deployment, and execution on the Apify platform.
```

##### `apify actors ls`

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

##### `apify actors rm ACTORID`

Permanently removes an Actor from your account.

```
USAGE
  $ apify actors rm ACTORID

ARGUMENTS
  ACTORID  The Actor ID to delete.

DESCRIPTION
  Permanently removes an Actor from your account.
```

##### `apify actor`

Manages runtime data operations inside of a running Actor.

```
USAGE
  $ apify actor

DESCRIPTION
  Manages runtime data operations inside of a running Actor.
```

##### `apify actor charge EVENTNAME`

Charge for a specific event in the pay-per-event Actor run.

```
USAGE
  $ apify actor charge EVENTNAME [--count <value>] [--idempotency-key <value>] [--test-pay-per-event]

ARGUMENTS
  EVENTNAME  Name of the event to charge for

FLAGS
  --count=<value>            [default: 1] Number of events to charge
  --idempotency-key=<value>  Idempotency key for the charge request
  --test-pay-per-event       Test pay-per-event charging without actually charging

DESCRIPTION
  Charge for a specific event in the pay-per-event Actor run.
```

##### `apify actor get-input`

Gets the Actor input value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-input

DESCRIPTION
  Gets the Actor input value from the default key-value store associated with the Actor run.
```

##### `apify actor get-public-url KEY`

Get an HTTP URL that allows public access to a key-value store item.

```
USAGE
  $ apify actor get-public-url KEY

ARGUMENTS
  KEY  Key of the record in key-value store

DESCRIPTION
  Get an HTTP URL that allows public access to a key-value store item.
```

##### `apify actor get-value KEY`

Gets a value from the default key-value store associated with the Actor run.

```
USAGE
  $ apify actor get-value KEY

ARGUMENTS
  KEY  Key of the record in key-value store

DESCRIPTION
  Gets a value from the default key-value store associated with the Actor run.
```

##### `apify actor push-data [ITEM]`

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

##### `apify actor set-value KEY [VALUE]`

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
<!-- actor-basic-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Deployment

These commands handle the deployment workflow of Actors to Apify platform. Use them to push local changes, pull remote Actors, and manage Actor versions and builds.

<!-- prettier-ignore-start -->
<!-- actor-deploy-commands-start -->
##### `apify push [ACTORID]`

##### `apify actors push [ACTORID]`

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

##### `apify pull [ACTORID]`

##### `apify actors pull [ACTORID]`

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

##### `apify call [ACTORID]`

##### `apify actors call [ACTORID]`

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

##### `apify actors start [ACTORID]`

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

##### `apify actors info ACTORID`

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
<!-- actor-deploy-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Builds

Use these commands to manage Actor build processes. They help you create, monitor, and maintain versioned snapshots of your Actors that can be executed on Apify platform.

<!-- prettier-ignore-start -->
<!-- actor-build-commands-start -->
##### `apify builds`

Manages Actor build processes and versioning.

```
USAGE
  $ apify builds

DESCRIPTION
  Manages Actor build processes and versioning.
```

##### `apify builds create [ACTORID]`

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

##### `apify actors build [ACTORID]`

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

##### `apify builds info BUILDID`

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

##### `apify builds log BUILDID`

Prints the log of a specific build.

```
USAGE
  $ apify builds log BUILDID

ARGUMENTS
  BUILDID  The build ID to get the log from.

DESCRIPTION
  Prints the log of a specific build.
```

##### `apify builds ls [ACTORID]`

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

##### `apify builds rm BUILDID`

Permanently removes an Actor build from the Apify platform.

```
USAGE
  $ apify builds rm BUILDID

ARGUMENTS
  BUILDID  The build ID to delete.

DESCRIPTION
  Permanently removes an Actor build from the Apify platform.
```
<!-- actor-build-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Runs

These commands control Actor execution on Apify platform. Use them to start, monitor, and manage Actor runs, including accessing logs and handling execution states.

<!-- prettier-ignore-start -->
<!-- actor-run-commands-start -->
##### `apify runs`

Manages Actor run operations

```
USAGE
  $ apify runs

DESCRIPTION
  Manages Actor run operations
```

##### `apify runs abort RUNID`

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

##### `apify runs info RUNID`

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

##### `apify runs log RUNID`

Prints the log of a specific run.

```
USAGE
  $ apify runs log RUNID

ARGUMENTS
  RUNID  The run ID to get the log from.

DESCRIPTION
  Prints the log of a specific run.
```

##### `apify runs ls [ACTORID]`

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

##### `apify runs resurrect RUNID`

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

##### `apify runs rm RUNID`

Deletes an Actor Run.

```
USAGE
  $ apify runs rm RUNID

ARGUMENTS
  RUNID  The run ID to delete.

DESCRIPTION
  Deletes an Actor Run.
```
<!-- actor-run-commands-end -->
<!-- prettier-ignore-end -->

### Storage

These commands manage data storage on Apify platform. Use them to work with datasets, key-value stores, and request queues for persistent data storage and retrieval.

#### Datasets

Use these commands to manage datasets, which provide structured storage for tabular data. They enable creation, modification, and data manipulation within datasets.

<!-- prettier-ignore-start -->
<!-- dataset-commands-start -->
##### `apify datasets`

Manages structured data storage and retrieval.

```
USAGE
  $ apify datasets

DESCRIPTION
  Manages structured data storage and retrieval.
```

##### `apify datasets create [DATASETNAME]`

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

##### `apify datasets get-items DATASETID`

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

##### `apify datasets info STOREID`

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

##### `apify datasets ls`

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

##### `apify datasets push-items NAMEORID [ITEM]`

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

##### `apify datasets rename NAMEORID [NEWNAME]`

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

##### `apify datasets rm DATASETNAMEORID`

Permanently removes a dataset.

```
USAGE
  $ apify datasets rm DATASETNAMEORID

ARGUMENTS
  DATASETNAMEORID  The dataset ID or name to delete

DESCRIPTION
  Permanently removes a dataset.
```
<!-- dataset-commands-end -->
<!-- prettier-ignore-end -->

#### Key-Value Stores

These commands handle key-value store operations. Use them to create stores, manage key-value pairs, and handle persistent storage of arbitrary data types.

<!-- prettier-ignore-start -->
<!-- keyval-commands-start -->
##### `apify key-value-stores`

Manages persistent key-value storage.

```
USAGE
  $ apify key-value-stores

DESCRIPTION
  Manages persistent key-value storage.

  Alias: kvs
```

##### `apify key-value-stores create [KEYVALUESTORENAME]`

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

##### `apify key-value-stores delete-value STOREID ITEMKEY`

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

##### `apify key-value-stores get-value KEYVALUESTOREID ITEMKEY`

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

##### `apify key-value-stores info STOREID`

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

##### `apify key-value-stores keys STOREID`

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

##### `apify key-value-stores ls`

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

##### `apify key-value-stores rename KEYVALUESTORENAMEORID [NEWNAME]`

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

##### `apify key-value-stores rm KEYVALUESTORENAMEORID`

Permanently removes a key-value store.

```
USAGE
  $ apify key-value-stores rm KEYVALUESTORENAMEORID

ARGUMENTS
  KEYVALUESTORENAMEORID  The key-value store ID or name to delete

DESCRIPTION
  Permanently removes a key-value store.
```

##### `apify key-value-stores set-value STOREID ITEMKEY [VALUE]`

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
<!-- keyval-commands-end -->
<!-- prettier-ignore-end -->

#### Request Queues

These commands manage request queues, which handle URL processing for web scraping and automation tasks. Use them to maintain lists of URLs with automatic retry mechanisms and state management.

<!-- prettier-ignore-start -->
<!-- reqqueue-commands-start -->
##### `apify request-queues`

Manages URL queues for web scraping and automation tasks.

```
USAGE
  $ apify request-queues

DESCRIPTION
  Manages URL queues for web scraping and automation tasks.
```
<!-- reqqueue-commands-end -->
<!-- prettier-ignore-end -->

### Tasks

These commands help you manage scheduled and configured Actor runs. Use them to create, modify, and execute predefined Actor configurations as tasks.

<!-- prettier-ignore-start -->
<!-- task-commands-start -->
##### `apify task`

Manages scheduled and predefined Actor configurations.

```
USAGE
  $ apify task

DESCRIPTION
  Manages scheduled and predefined Actor configurations.
```

##### `apify task run TASKID`

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
<!-- task-commands-end -->
<!-- prettier-ignore-end -->
