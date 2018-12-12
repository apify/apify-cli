<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->

```text
Apify command line client to help you create, develop, build and run Apify actors.

VERSION
  apify-cli/0.3.3 darwin-x64 node-v11.2.0

USAGE
  $ apify [COMMAND]

COMMANDS
  call     Runs the actor remotely on the Apify platform.
  create   Creates a new actor project directory from a selected boilerplate
           template.
  info     Displays information about current Apify settings.
  init     Initializes an actor project in an existing directory.
  login    Logs in to the Apify platform using the API token.
  logout   Logs out of the Apify platform.
  push     Uploads the actor to the Apify platform and builds it there.
  run      Runs the actor locally in the current directory by executing "npm
           start".
  secrets  Manages secret values for actor environment variables.

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
Creates a new actor project directory from a selected boilerplate template.

USAGE
  $ apify create ACTORNAME

ARGUMENTS
  ACTORNAME  Name of the actor and its directory

OPTIONS
  -t, --template=puppeteer_crawler|puppeteer|basic|hello_word
      Boilerplate template for the actor. If not provided, the command will prompt
      for it.

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
  $ apify push [ACTORID]

ARGUMENTS
  ACTORID  ID of an existing actor on the Apify platform where the files will be
           pushed. If not provided, the command will create or modify the actor
           with the name specified in "apify.json" file.

OPTIONS
  -b, --build-tag=build-tag              Build tag to be applied to the
                                         successful actor build. By default, it
                                         is taken from the "apify.json" file

  -v, --version=version                  Actor version number to which the files
                                         should be pushed. By default, it is
                                         taken from the "apify.json" file.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to build to finish,
                                         if no value passed, it waits forever.

  --version-number=version-number        DEPRECATED: Use flag version instead.
                                         Actor version number to which the files
                                         should be pushed. By default, it is
                                         taken from the "apify.json" file.

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
### apify secrets
```text
Manages secret values for actor environment variables.

USAGE
  $ apify secrets

DESCRIPTION
  Example:
  $ apify secrets:add mySecret TopSecretValue123

  Now the "mySecret" value can be used in an environment variable defined in
  "apify.json" file by adding the "@" prefix:

  {
     "name": "my_actor",
     "env": { "SECRET_ENV_VAR": "@mySecret" },
     "version": "0.1
  }

  When the actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is
  stored as a secret environment variable of the actor.

COMMANDS
  secrets:add  Adds a new secret value.
  secrets:rm   Removes the secret.

```

<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->
