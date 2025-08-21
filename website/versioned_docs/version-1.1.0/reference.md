---
title: Apify CLI Reference Documentation
sidebar_label: Command reference
toc_max_heading_level: 5
---

The Apify CLI provides tools for managing your Apify projects and resources from the command line. Use these commands to develop Actors locally, deploy them to Apify platform, manage storage, orchestrate runs, and handle account configuration.

This reference guide documents available commands, their options, and common usage patterns, to efficiently work with Apify platform.

### General

The general commands provide basic functionality for getting help and information about the Apify CLI.

<!-- prettier-ignore-start -->
<!-- general-commands-start -->
##### `apify help`

```sh
DESCRIPTION
  Prints out help about a command, or all available commands.

USAGE
  $ apify help [commandString]

ARGUMENTS
  commandString  The command to get help for.
```

##### `apify upgrade`

```sh
DESCRIPTION
  Checks that installed Apify CLI version is up to date.

USAGE
  $ apify upgrade [-f] [--version <value>]

FLAGS
  -f, --force            [DEPRECATED] This flag is now
                         ignored, as running the command manually will always check
                         for the latest version.
      --version=<value>  The version of the CLI to upgrade to. If
                         not provided, the latest version will be used.
```

##### `apify telemetry`

```sh
DESCRIPTION
  Manages telemetry settings. We use this data to improve the CLI and the Apify
  platform.
  Read more: https://docs.apify.com/cli/docs/telemetry

SUBCOMMANDS
  telemetry enable   Enables telemetry.
  telemetry disable  Disables telemetry.
```

##### `apify telemetry enable`

```sh
DESCRIPTION
  Enables telemetry.

USAGE
  $ apify telemetry enable
```

##### `apify telemetry disable`

```sh
DESCRIPTION
  Disables telemetry.

USAGE
  $ apify telemetry disable
```
<!-- general-commands-end -->
<!-- prettier-ignore-end -->

### Authentication & Account Management

Use these commands to manage your Apify account authentication, access tokens, and configuration settings. These commands control how you interact with Apify platform and manage sensitive information.

<!-- prettier-ignore-start -->
<!-- auth-commands-start -->
##### `apify login`

```sh
DESCRIPTION
  Authenticates your Apify account and saves credentials to
  '~/.apify/auth.json'.
  All other commands use these stored credentials.

  Run 'apify logout' to remove authentication.

USAGE
  $ apify login [-m console|manual] [-t <value>]

FLAGS
  -m, --method=<option>  Method of logging in to Apify
                         <options: console|manual>
  -t, --token=<value>    Apify API token
```

##### `apify logout`

```sh
DESCRIPTION
  Removes authentication by deleting your API token and account information from
   '~/.apify/auth.json'.
  Run 'apify login' to authenticate again.

USAGE
  $ apify logout
```

##### `apify info`

```sh
DESCRIPTION
  Prints details about your currently authenticated Apify account.

USAGE
  $ apify info
```

##### `apify secrets`

```sh
DESCRIPTION
  Manages secure environment variables for Actors.

  Example:
  $ apify secrets add mySecret TopSecretValue123

  The "mySecret" value can be used in an environment variable defined in
  '.actor/actor.json' file by adding the "@" prefix:

  {
    "actorSpecification": 1,
    "name": "my_actor",
    "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },
    "version": "0.1"
  }

  When the Actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is
   stored as a secret environment variable of the Actor.

SUBCOMMANDS
  secrets add  Adds a new secret to '~/.apify' for use in Actor
               environment variables.
  secrets rm   Permanently deletes a secret from your stored
               credentials.
```

##### `apify secrets add`

```sh
DESCRIPTION
  Adds a new secret to '~/.apify' for use in Actor environment variables.

USAGE
  $ apify secrets add <name> <value>

ARGUMENTS
  name   Name of the secret
  value  Value of the secret
```

##### `apify secrets rm`

```sh
DESCRIPTION
  Permanently deletes a secret from your stored credentials.

USAGE
  $ apify secrets rm <name>

ARGUMENTS
  name  Name of the secret
```
<!-- auth-commands-end -->
<!-- prettier-ignore-end -->

### Actor Development

These commands help you develop Actors locally. Use them to create new Actor projects, initialize configurations, run Actors in development mode, and validate input schemas.

<!-- prettier-ignore-start -->
<!-- actor-dev-commands-start -->
##### `apify create`

```sh
DESCRIPTION
  Creates an Actor project from a template in a new directory.

USAGE
  $ apify create [actorName] [--omit-optional-deps]
                 [--skip-dependency-install] [-t <value>]

ARGUMENTS
  actorName  Name of the Actor and its directory

FLAGS
      --omit-optional-deps       Skip installing optional
                                 dependencies.
      --skip-dependency-install  Skip installing Actor
                                 dependencies.
  -t, --template=<value>         Template for the
                                 Actor. If not provided, the command will prompt for
                                 it. Visit
                                 https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json
                                 to find available template names.
```

##### `apify init`

```sh
DESCRIPTION
  Sets up an Actor project in your current directory by creating actor.json and
  storage files.
  If the directory contains a Scrapy project in Python, the command
  automatically creates wrappers so that you can run your scrapers without
  changes.
  Creates the '.actor/actor.json' file and the 'storage' directory in the
  current directory, but does not touch any other existing files or directories.

  WARNING: Overwrites existing 'storage' directory.

USAGE
  $ apify init [actorName] [-y]

ARGUMENTS
  actorName  Name of the Actor. If not provided, you will be prompted
             for it.

FLAGS
  -y, --yes  Automatic yes to prompts; assume "yes" as answer to all
             prompts. Note that in some cases, the command may still ask for
             confirmation.
```

##### `apify run`

```sh
DESCRIPTION
  Executes Actor locally with simulated Apify environment variables.
  Stores data in local 'storage' directory.

  NOTE: For Node.js Actors, customize behavior by modifying the 'start' script
  in package.json file.

USAGE
  $ apify run [--entrypoint <value>]
              [-i <value> | --input-file <value>] [-p | --resurrect]

FLAGS
      --entrypoint=<value>  Optional entrypoint for running
                            with injected environment variables.
                            For Python, it is the module name, or a path to a file.
                            For Node.js, it is the npm script name, or a path to a
                            JS/MJS file. You can also pass in a directory name,
                            provided that directory contains an "index.js" file.
  -i, --input=<value>       Optional JSON input to be
                            given to the Actor.
      --input-file=<value>  Optional path to a file with JSON
                            input to be given to the Actor. The file must be a valid
                            JSON file. You can also specify `-` to read from
                            standard input.
  -p, --purge               Whether to purge the default
                            request queue, dataset and key-value store before the
                            run starts.
                            For crawlee projects, this is the default behavior, and
                            the flag is optional.
                            Use `--no-purge` to keep the storage folder intact.
      --resurrect           Whether to keep the default
                            request queue, dataset and key-value store before the
                            run starts.
```

##### `apify validate-schema`

```sh
DESCRIPTION
  Validates Actor input schema from one of these locations (in priority order):
    1. Object in '.actor/actor.json' under "input" key
    2. JSON file path in '.actor/actor.json' "input" key
    3. .actor/INPUT_SCHEMA.json
    4. INPUT_SCHEMA.json

  Optionally specify custom schema path to validate.

USAGE
  $ apify validate-schema [path]

ARGUMENTS
  path  Optional path to your INPUT_SCHEMA.json file. If not provided
        ./INPUT_SCHEMA.json is used.
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

```sh
DESCRIPTION
  Manages Actor creation, deployment, and execution on the Apify platform.

SUBCOMMANDS
  actors start  Starts Actor remotely and returns run details
                immediately.
  actors rm     Permanently removes an Actor from your account.
  actors push   Deploys Actor to Apify platform using settings from
                '.actor/actor.json'.
  actors pull   Download Actor code to current directory. Clones Git
                repositories or fetches Actor files based on the source type.
  actors ls     Prints a list of recently executed Actors or Actors
                you own.
  actors info   Get information about an Actor.
  actors call   Executes Actor remotely using your authenticated
                account.
  actors build  Creates a new build of the Actor.
```

##### `apify actors ls`

```sh
DESCRIPTION
  Prints a list of recently executed Actors or Actors you own.

USAGE
  $ apify actors ls [--desc] [--json] [--limit <value>] [--my]
                    [--offset <value>]

FLAGS
      --desc            Sort Actors in descending order.
      --json            Format the command output as JSON
      --limit=<value>   Number of Actors that will be listed.
      --my              Whether to list Actors made by the logged
                        in user.
      --offset=<value>  Number of Actors that will be skipped.
```

##### `apify actors rm`

```sh
DESCRIPTION
  Permanently removes an Actor from your account.

USAGE
  $ apify actors rm <actorId>

ARGUMENTS
  actorId  The Actor ID to delete.
```

##### `apify actor`

```sh
DESCRIPTION
  Manages runtime data operations inside of a running Actor.

SUBCOMMANDS
  actor set-value       Sets or removes record into the
                        default key-value store associated with the Actor run.
  actor push-data       Saves data to Actor's run default
                        dataset.
  actor get-value       Gets a value from the default
                        key-value store associated with the Actor run.
  actor get-public-url  Get an HTTP URL that allows public
                        access to a key-value store item.
  actor get-input       Gets the Actor input value from the
                        default key-value store associated with the Actor run.
  actor charge          Charge for a specific event in the
                        pay-per-event Actor run.
```

##### `apify actor charge`

```sh
DESCRIPTION
  Charge for a specific event in the pay-per-event Actor run.

USAGE
  $ apify actor charge <eventName> [--count <value>]
                       [--idempotency-key <value>] [--test-pay-per-event]

ARGUMENTS
  eventName  Name of the event to charge for

FLAGS
      --count=<value>            Number of events to
                                 charge
      --idempotency-key=<value>  Idempotency key for the
                                 charge request
      --test-pay-per-event       Test pay-per-event
                                 charging without actually charging
```

##### `apify actor get-input`

```sh
DESCRIPTION
  Gets the Actor input value from the default key-value store associated with
  the Actor run.

USAGE
  $ apify actor get-input
```

##### `apify actor get-public-url`

```sh
DESCRIPTION
  Get an HTTP URL that allows public access to a key-value store item.

USAGE
  $ apify actor get-public-url <key>

ARGUMENTS
  key  Key of the record in key-value store
```

##### `apify actor get-value`

```sh
DESCRIPTION
  Gets a value from the default key-value store associated with the Actor run.

USAGE
  $ apify actor get-value <key>

ARGUMENTS
  key  Key of the record in key-value store
```

##### `apify actor push-data`

```sh
DESCRIPTION
  Saves data to Actor's run default dataset.

  Accept input as:
    - JSON argument:
    $ apify actor push-data {"key": "value"}
    - Piped stdin:
    $ cat ./test.json | apify actor push-data

USAGE
  $ apify actor push-data [item]

ARGUMENTS
  item  JSON string with one object or array of objects containing data to
        be stored in the default dataset.
```

##### `apify actor set-value`

```sh
DESCRIPTION
  Sets or removes record into the default key-value store associated with the
  Actor run.

  It is possible to pass data using argument or stdin.

  Passing data using argument:
  $ apify actor set-value KEY my-value

  Passing data using stdin with pipe:
  $ cat ./my-text-file.txt | apify actor set-value KEY --contentType text/plain

USAGE
  $ apify actor set-value <key> [value] [-c <value>]

ARGUMENTS
  key    Key of the record in key-value store.
  value  Record data, which can be one of the following values:
         - If empty, the record in the key-value store is deleted.
         - If no `contentType` flag is specified, value is expected to be any JSON
         string value.
         - If options.contentType is set, value is taken as is.

FLAGS
  -c, --content-type=<value>  Specifies a custom MIME
                              content type of the record. By default
                              "application/json" is used.
```
<!-- actor-basic-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Deployment

These commands handle the deployment workflow of Actors to Apify platform. Use them to push local changes, pull remote Actors, and manage Actor versions and builds.

<!-- prettier-ignore-start -->
<!-- actor-deploy-commands-start -->
##### `apify actors push` / `apify push`

```sh
DESCRIPTION
  Deploys Actor to Apify platform using settings from '.actor/actor.json'.
  Files under '3' MB upload as "Multiple source files"; larger projects upload
  as ZIP file.
  Use --force to override newer remote versions.

USAGE
  $ apify actors push [actorId] [-b <value>] [--dir <value>]
                      [--force] [--open] [-v <value>] [-w <value>]

ARGUMENTS
  actorId  Name or ID of the Actor to push (e.g. "apify/hello-world" or
           "E2jjCZBezvAZnX8Rb"). If not provided, the command will create or
           modify the Actor with the name specified in '.actor/actor.json' file.

FLAGS
  -b, --build-tag=<value>        Build tag to be
                                 applied to the successful Actor build. By default,
                                 it is taken from the '.actor/actor.json' file
      --dir=<value>              Directory where the
                                 Actor is located
      --force                    Push an Actor even when
                                 the local files are older than the Actor on the
                                 platform.
      --open                     Whether to open the
                                 browser automatically to the Actor details page.
  -v, --version=<value>          Actor version number
                                 to which the files should be pushed. By default, it
                                 is taken from the '.actor/actor.json' file.
  -w, --wait-for-finish=<value>  Seconds for waiting
                                 to build to finish, if no value passed, it waits
                                 forever.
```

##### `apify actors pull` / `apify pull`

```sh
DESCRIPTION
  Download Actor code to current directory. Clones Git repositories or fetches
  Actor files based on the source type.

USAGE
  $ apify actors pull [actorId] [--dir <value>] [-v <value>]

ARGUMENTS
  actorId  Name or ID of the Actor to run (e.g. "apify/hello-world" or
           "E2jjCZBezvAZnX8Rb"). If not provided, the command will update the
           Actor in the current directory based on its name in ".actor/actor.json"
           file.

FLAGS
      --dir=<value>      Directory where the Actor should be
                         pulled to
  -v, --version=<value>  Actor version number which will be
                         pulled, e.g. 1.2. Default: the highest version
```

##### `apify actors call` / `apify call`

```sh
DESCRIPTION
  Executes Actor remotely using your authenticated account.
  Reads input from local key-value store by default.

USAGE
  $ apify actors call [actorId] [-b <value>]
                      [-i <value> | -f <value>] [--json] [-m <value>] [-o] [-s]
                      [-t <value>]

ARGUMENTS
  actorId  Name or ID of the Actor to run (e.g. "my-actor",
           "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command runs the remote Actor specified in the '.actor/actor.json'
           file.

FLAGS
  -b, --build=<value>       Tag or number of the build to
                            run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be
                            given to the Actor.
  -f, --input-file=<value>  Optional path to a file with
                            JSON input to be given to the Actor. The file must be a
                            valid JSON file. You can also specify `-` to read from
                            standard input.
      --json                Format the command output as JSON
  -m, --memory=<value>      Amount of memory allocated for
                            the Actor run, in megabytes.
  -o, --output-dataset      Prints out the entire default
                            dataset on successful run of the Actor.
  -s, --silent              Prevents printing the logs of
                            the Actor run to the console.
  -t, --timeout=<value>     Timeout for the Actor run in
                            seconds. Zero value means there is no timeout.
```

##### `apify actors start`

```sh
DESCRIPTION
  Starts Actor remotely and returns run details immediately.
  Uses authenticated account and local key-value store for input.

USAGE
  $ apify actors start [actorId] [-b <value>]
                       [-i <value> | --input-file <value>] [--json] [-m <value>]
                       [-t <value>]

ARGUMENTS
  actorId  Name or ID of the Actor to run (e.g. "my-actor",
           "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). If not provided, the
           command runs the remote Actor specified in the '.actor/actor.json'
           file.

FLAGS
  -b, --build=<value>       Tag or number of the build to
                            run (e.g. "latest" or "1.2.34").
  -i, --input=<value>       Optional JSON input to be
                            given to the Actor.
      --input-file=<value>  Optional path to a file with JSON
                            input to be given to the Actor. The file must be a valid
                            JSON file. You can also specify `-` to read from
                            standard input.
      --json                Format the command output as JSON
  -m, --memory=<value>      Amount of memory allocated for
                            the Actor run, in megabytes.
  -t, --timeout=<value>     Timeout for the Actor run in
                            seconds. Zero value means there is no timeout.
```

##### `apify actors info`

```sh
DESCRIPTION
  Get information about an Actor.

USAGE
  $ apify actors info <actorId> [--input | --readme] [--json]

ARGUMENTS
  actorId  The ID of the Actor to return information about.

FLAGS
      --input   Return the Actor input schema.
      --json    Format the command output as JSON
      --readme  Return the Actor README.
```
<!-- actor-deploy-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Builds

Use these commands to manage Actor build processes. They help you create, monitor, and maintain versioned snapshots of your Actors that can be executed on Apify platform.

<!-- prettier-ignore-start -->
<!-- actor-build-commands-start -->
##### `apify builds`

```sh
DESCRIPTION
  Manages Actor build processes and versioning.

SUBCOMMANDS
  builds rm      Permanently removes an Actor build from the Apify
                 platform.
  builds ls      Lists all builds of the Actor.
  builds log     Prints the log of a specific build.
  builds info    Prints information about a specific build.
  builds create  Creates a new build of the Actor.
```

##### `apify builds create` / `apify actors build`

```sh
DESCRIPTION
  Creates a new build of the Actor.

USAGE
  $ apify builds create [actorId] [--json] [--log]
                        [--tag <value>] [--version <value>]

ARGUMENTS
  actorId  Optional Actor ID or Name to trigger a build for. By default,
           it will use the Actor from the current directory.

FLAGS
      --json             Format the command output as JSON
      --log              Whether to print out the build log after
                         the build is triggered.
      --tag=<value>      Build tag to be applied to the
                         successful Actor build. By default, this is "latest".
      --version=<value>  Optional Actor Version to build. By
                         default, this will be inferred from the tag, but this flag
                         is required when multiple versions have the same tag.
```

##### `apify builds info`

```sh
DESCRIPTION
  Prints information about a specific build.

USAGE
  $ apify builds info <buildId> [--json]

ARGUMENTS
  buildId  The build ID to get information about.

FLAGS
      --json  Format the command output as JSON
```

##### `apify builds log`

```sh
DESCRIPTION
  Prints the log of a specific build.

USAGE
  $ apify builds log <buildId>

ARGUMENTS
  buildId  The build ID to get the log from.
```

##### `apify builds ls`

```sh
DESCRIPTION
  Lists all builds of the Actor.

USAGE
  $ apify builds ls [actorId] [-c] [--desc] [--json]
                    [--limit <value>] [--offset <value>]

ARGUMENTS
  actorId  Optional Actor ID or Name to list runs for. By default, it
           will use the Actor from the current directory.

FLAGS
  -c, --compact         Display a compact table.
      --desc            Sort builds in descending order.
      --json            Format the command output as JSON
      --limit=<value>   Number of builds that will be listed.
      --offset=<value>  Number of builds that will be skipped.
```

##### `apify builds rm`

```sh
DESCRIPTION
  Permanently removes an Actor build from the Apify platform.

USAGE
  $ apify builds rm <buildId>

ARGUMENTS
  buildId  The build ID to delete.
```
<!-- actor-build-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Runs

These commands control Actor execution on Apify platform. Use them to start, monitor, and manage Actor runs, including accessing logs and handling execution states.

<!-- prettier-ignore-start -->
<!-- actor-run-commands-start -->
##### `apify runs`

```sh
DESCRIPTION
  Manages Actor run operations

SUBCOMMANDS
  runs abort      Aborts an Actor run.
  runs info       Prints information about an Actor run.
  runs log        Prints the log of a specific run.
  runs ls         Lists all runs of the Actor.
  runs resurrect  Resurrects an aborted or finished Actor Run.
  runs rm         Deletes an Actor Run.
```

##### `apify runs abort`

```sh
DESCRIPTION
  Aborts an Actor run.

USAGE
  $ apify runs abort <runId> [-f] [--json]

ARGUMENTS
  runId  The run ID to abort.

FLAGS
  -f, --force  Whether to force the run to abort immediately, instead
               of gracefully.
      --json   Format the command output as JSON
```

##### `apify runs info`

```sh
DESCRIPTION
  Prints information about an Actor run.

USAGE
  $ apify runs info <runId> [--json] [-v]

ARGUMENTS
  runId  The run ID to print information about.

FLAGS
      --json     Format the command output as JSON
  -v, --verbose  Prints more in-depth information about the Actor
                 run.
```

##### `apify runs log`

```sh
DESCRIPTION
  Prints the log of a specific run.

USAGE
  $ apify runs log <runId>

ARGUMENTS
  runId  The run ID to get the log from.
```

##### `apify runs ls`

```sh
DESCRIPTION
  Lists all runs of the Actor.

USAGE
  $ apify runs ls [actorId] [-c] [--desc] [--json]
                  [--limit <value>] [--offset <value>]

ARGUMENTS
  actorId  Optional Actor ID or Name to list runs for. By default, it
           will use the Actor from the current directory.

FLAGS
  -c, --compact         Display a compact table.
      --desc            Sort runs in descending order.
      --json            Format the command output as JSON
      --limit=<value>   Number of runs that will be listed.
      --offset=<value>  Number of runs that will be skipped.
```

##### `apify runs resurrect`

```sh
DESCRIPTION
  Resurrects an aborted or finished Actor Run.

USAGE
  $ apify runs resurrect <runId> [--json]

ARGUMENTS
  runId  The run ID to resurrect.

FLAGS
      --json  Format the command output as JSON
```

##### `apify runs rm`

```sh
DESCRIPTION
  Deletes an Actor Run.

USAGE
  $ apify runs rm <runId>

ARGUMENTS
  runId  The run ID to delete.
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

```sh
DESCRIPTION
  Manages structured data storage and retrieval.

SUBCOMMANDS
  datasets create      Creates a new dataset for storing
                       structured data on your account.
  datasets get-items   Retrieves dataset items in specified
                       format (JSON, CSV, etc).
  datasets ls          Prints all datasets on your account.
  datasets info        Prints information about a specific
                       dataset.
  datasets rm          Permanently removes a dataset.
  datasets rename      Change dataset name or removes name
                       with --unname flag.
  datasets push-items  Adds data items to specified dataset.
                       Accepts single object or array of objects.
```

##### `apify datasets create`

```sh
DESCRIPTION
  Creates a new dataset for storing structured data on your account.

USAGE
  $ apify datasets create [datasetName] [--json]

ARGUMENTS
  datasetName  Optional name for the Dataset

FLAGS
      --json  Format the command output as JSON
```

##### `apify datasets get-items`

```sh
DESCRIPTION
  Retrieves dataset items in specified format (JSON, CSV, etc).

USAGE
  $ apify datasets get-items <datasetId>
                             [--format json|jsonl|csv|html|rss|xml|xlsx]
                             [--limit <value>] [--offset <value>]

ARGUMENTS
  datasetId  The ID of the Dataset to export the items for

FLAGS
      --format=<option>  The format of the returned output. By
                         default, it is set to 'json'
                         <options: json|jsonl|csv|html|rss|xml|xlsx>
      --limit=<value>    The amount of elements to get from the
                         dataset. By default, it will return all available items.
      --offset=<value>   The offset in the dataset where to start
                         getting items.
```

##### `apify datasets info`

```sh
DESCRIPTION
  Prints information about a specific dataset.

USAGE
  $ apify datasets info <storeId> [--json]

ARGUMENTS
  storeId  The dataset store ID to print information about.

FLAGS
      --json  Format the command output as JSON
```

##### `apify datasets ls`

```sh
DESCRIPTION
  Prints all datasets on your account.

USAGE
  $ apify datasets ls [--desc] [--json] [--limit <value>]
                      [--offset <value>] [--unnamed]

FLAGS
      --desc            Sorts datasets in descending order.
      --json            Format the command output as JSON
      --limit=<value>   Number of datasets that will be listed.
      --offset=<value>  Number of datasets that will be skipped.
      --unnamed         Lists datasets that don't have a name set.
```

##### `apify datasets push-items`

```sh
DESCRIPTION
  Adds data items to specified dataset. Accepts single object or array of
  objects.

USAGE
  $ apify datasets push-items <nameOrId> [item]

ARGUMENTS
  nameOrId  The dataset ID or name to push the objects to
  item      The object or array of objects to be pushed.
```

##### `apify datasets rename`

```sh
DESCRIPTION
  Change dataset name or removes name with --unname flag.

USAGE
  $ apify datasets rename <nameOrId> [newName] [--unname]

ARGUMENTS
  nameOrId  The dataset ID or name to delete.
  newName   The new name for the dataset.

FLAGS
      --unname  Removes the unique name of the dataset.
```

##### `apify datasets rm`

```sh
DESCRIPTION
  Permanently removes a dataset.

USAGE
  $ apify datasets rm <datasetNameOrId>

ARGUMENTS
  datasetNameOrId  The dataset ID or name to delete
```
<!-- dataset-commands-end -->
<!-- prettier-ignore-end -->

#### Key-Value Stores

These commands handle key-value store operations. Use them to create stores, manage key-value pairs, and handle persistent storage of arbitrary data types.

<!-- prettier-ignore-start -->
<!-- keyval-commands-start -->
##### `apify key-value-stores`

```sh
DESCRIPTION
  Manages persistent key-value storage.

  Alias: kvs

SUBCOMMANDS
  key-value-stores create        Creates a new
                                 key-value store on your account.
  key-value-stores delete-value  Delete a value
                                 from a key-value store.
  key-value-stores get-value     Retrieves stored
                                 value for specified key. Use --only-content-type
                                 to check MIME type.
  key-value-stores info          Shows information
                                 about a key-value store.
  key-value-stores keys          Lists all keys in
                                 a key-value store.
  key-value-stores ls            Lists all
                                 key-value stores on your account.
  key-value-stores rename        Renames a
                                 key-value store, or removes its unique name.
  key-value-stores rm            Permanently
                                 removes a key-value store.
  key-value-stores set-value     Stores value with
                                 specified key. Set content-type with
                                 --content-type flag.
```

##### `apify key-value-stores create`

```sh
DESCRIPTION
  Creates a new key-value store on your account.

USAGE
  $ apify key-value-stores create
                                  [key-value store name] [--json]

ARGUMENTS
  key-value store name  Optional name for the key-value
                        store

FLAGS
      --json  Format the command output as JSON
```

##### `apify key-value-stores delete-value`

```sh
DESCRIPTION
  Delete a value from a key-value store.

USAGE
  $ apify key-value-stores delete-value
                                        <store id> <itemKey>

ARGUMENTS
  store id  The key-value store ID to delete the value from.
  itemKey   The key of the item in the key-value store.
```

##### `apify key-value-stores get-value`

```sh
DESCRIPTION
  Retrieves stored value for specified key. Use --only-content-type to check
  MIME type.

USAGE
  $ apify key-value-stores get-value
                                     <keyValueStoreId> <itemKey>
                                     [--only-content-type]

ARGUMENTS
  keyValueStoreId  The key-value store ID to get the value from.
  itemKey          The key of the item in the key-value store.

FLAGS
      --only-content-type  Only return the content type of the
                           specified key
```

##### `apify key-value-stores info`

```sh
DESCRIPTION
  Shows information about a key-value store.

USAGE
  $ apify key-value-stores info <storeId> [--json]

ARGUMENTS
  storeId  The key-value store ID to print information about.

FLAGS
      --json  Format the command output as JSON
```

##### `apify key-value-stores keys`

```sh
DESCRIPTION
  Lists all keys in a key-value store.

USAGE
  $ apify key-value-stores keys <storeId>
                                [--exclusive-start-key <value>] [--json]
                                [--limit <value>]

ARGUMENTS
  storeId  The key-value store ID to list keys for.

FLAGS
      --exclusive-start-key=<value>  The key to start
                                     the list from.
      --json                         Format the
                                     command output as JSON
      --limit=<value>                The maximum
                                     number of keys to return.
```

##### `apify key-value-stores ls`

```sh
DESCRIPTION
  Lists all key-value stores on your account.

USAGE
  $ apify key-value-stores ls [--desc] [--json]
                              [--limit <value>] [--offset <value>] [--unnamed]

FLAGS
      --desc            Sorts key-value stores in descending
                        order.
      --json            Format the command output as JSON
      --limit=<value>   Number of key-value stores that will be
                        listed.
      --offset=<value>  Number of key-value stores that will be
                        skipped.
      --unnamed         Lists key-value stores that don't have a
                        name set.
```

##### `apify key-value-stores rename`

```sh
DESCRIPTION
  Renames a key-value store, or removes its unique name.

USAGE
  $ apify key-value-stores rename
                                  <keyValueStoreNameOrId> [newName] [--unname]

ARGUMENTS
  keyValueStoreNameOrId  The key-value store ID or name to
                         delete
  newName                The new name for the key-value
                         store

FLAGS
      --unname  Removes the unique name of the key-value store
```

##### `apify key-value-stores rm`

```sh
DESCRIPTION
  Permanently removes a key-value store.

USAGE
  $ apify key-value-stores rm <keyValueStoreNameOrId>

ARGUMENTS
  keyValueStoreNameOrId  The key-value store ID or name to
                         delete
```

##### `apify key-value-stores set-value`

```sh
DESCRIPTION
  Stores value with specified key. Set content-type with --content-type flag.

USAGE
  $ apify key-value-stores set-value <storeId>
                                     <itemKey> [value] [--content-type <value>]

ARGUMENTS
  storeId  The key-value store ID to set the value in.
  itemKey  The key of the item in the key-value store.
  value    The value to set.

FLAGS
      --content-type=<value>  The MIME content type of the
                              value. By default, "application/json" is assumed.
```
<!-- keyval-commands-end -->
<!-- prettier-ignore-end -->

#### Request Queues

These commands manage request queues, which handle URL processing for web scraping and automation tasks. Use them to maintain lists of URLs with automatic retry mechanisms and state management.

<!-- prettier-ignore-start -->
<!-- reqqueue-commands-start -->
##### `apify request-queues`

```sh
DESCRIPTION
  Manages URL queues for web scraping and automation tasks.

USAGE
  $ apify request-queues
```
<!-- reqqueue-commands-end -->
<!-- prettier-ignore-end -->

### Tasks

These commands help you manage scheduled and configured Actor runs. Use them to create, modify, and execute predefined Actor configurations as tasks.

<!-- prettier-ignore-start -->
<!-- task-commands-start -->
##### `apify task`

```sh
DESCRIPTION
  Manages scheduled and predefined Actor configurations.

SUBCOMMANDS
  task run  Executes predefined Actor task remotely using local
            key-value store for input.
```

##### `apify task run`

```sh
DESCRIPTION
  Executes predefined Actor task remotely using local key-value store for input.
  Customize with --memory and --timeout flags.

USAGE
  $ apify task run <taskId> [-b <value>] [-m <value>]
                   [-t <value>]

ARGUMENTS
  taskId  Name or ID of the Task to run (e.g. "my-task" or
          "E2jjCZBezvAZnX8Rb").

FLAGS
  -b, --build=<value>    Tag or number of the build to run
                         (e.g. "latest" or "1.2.34").
  -m, --memory=<value>   Amount of memory allocated for the
                         Task run, in megabytes.
  -t, --timeout=<value>  Timeout for the Task run in seconds.
                         Zero value means there is no timeout.
```
<!-- task-commands-end -->
<!-- prettier-ignore-end -->
