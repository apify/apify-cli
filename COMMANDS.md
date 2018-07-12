<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->

```text
Apify command line client to help you create, develop, build and run Actor acts.

VERSION
  apify-cli/0.1.13 darwin-x64 node-v8.4.0

USAGE
  $ apify [COMMAND]

COMMANDS
  call    Runs the act remotely on the Apify platform.
  create  Creates a new act project directory from a selected template.
  info    Displays information about current Apify settings.
  init    Initializes an act project in an existing directory.
  login   Logs in to the Apify platform using the API token.
  logout  Logs out of the Apify platform.
  push    Uploads the act to the Apify platform and builds it there.
  run     Runs the act locally in the current directory.

```
### apify call
```text
Runs the act remotely on the Apify platform.

USAGE
  $ apify call [ACTID]

ARGUMENTS
  ACTID  Name or ID of the act to run (e.g. "apify/hello-world" or
         "E2jjCZBezvAZnX8Rb"). If not provided, the command runs the remote act
         specified in the "apify.json" file.

OPTIONS
  -b, --build=build                      Tag or number of the build to run (e.g.
                                         "latest" or "1.2.34").

  -m, --memory=memory                    Amount of memory allocated for the act
                                         run, in megabytes.

  -t, --timeout=timeout                  Timeout for the act run in seconds.
                                         Zero value means there is no timeout.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to run to finish,
                                         if no value passed, it waits forever.

DESCRIPTION
  The act is run under your current Apify account, therefore you need to be 
  logged in by calling "apify login". It takes input for the act from default 
  local key-value store by default.

```
### apify create
```text
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
```text
Displays information about current Apify settings.

USAGE
  $ apify info

DESCRIPTION
  This command prints information about Apify to the console.

```
### apify init
```text
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
Uploads the act to the Apify platform and builds it there.

USAGE
  $ apify push [ACTID]

ARGUMENTS
  ACTID  ID of an existing act on the Apify platform where the files will be
         pushed. If not provided, the command will create or modify the act with
         the name specified in "apify.json" file.

OPTIONS
  -b, --build-tag=build-tag              Build tag to be applied to the
                                         successful act build. By default, it is
                                         taken from the "apify.json" file

  -v, --version-number=version-number    Act version number to which the files
                                         should be pushed. By default, it is
                                         taken from the "apify.json" file.

  -w, --wait-for-finish=wait-for-finish  Seconds for waiting to build to finish,
                                         if no value passed, it waits forever.

DESCRIPTION
  The command creates a ZIP with files of the act from the current directory, 
  uploads it to the Apify platform and builds it. The act settings are read from 
  the "apify.json" file in the current directory, but they can be overridden 
  using command-line options.

  WARNING: If the target act already exists in your Apify account, it will be 
  overwritten!

```
### apify run
```text
Runs the act locally in the current directory.

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
  The command runs a Node.js process with the act in the current directory. It 
  sets various APIFY_XYZ environment variables in order to provide a working 
  execution environment for the act. For example, this causes the act input, as 
  well as all other data in key-value stores, datasets or request queues to be 
  stored in the "apify_local" directory, rather than on the Apify platform.

```

<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->
