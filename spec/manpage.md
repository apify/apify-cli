```
APIFY-CLI(1)               General Commands Manual              APIFY-CLI(1)

NAME
       apify - Command-line interface for Apify platform

SYNOPSIS
       apify [COMMAND] [OPTIONS]

DESCRIPTION
       The Apify CLI provides a command-line interface for interacting
       with the Apify platform, designed to be friendly for both manual
       use and scripting. The CLI aims to be consistent with the Apify SDK,
       Apify platform, and Actor specifications.

GENERAL OPTIONS
       --json
              Ensures input and output are in JSON format.

       --actor-run-id
              Overrides the ACTOR_RUN_ID environment variable.

TOP-LEVEL COMMANDS
       apify init
              Initialize a new Apify project.

       apify create
              Create a new Apify actor.

       apify push
             Push local changes to the Apify platform. It creates new 
             Remote Actor if it doesn't exist, its new version and starts
             a new build.

       apify pull
              Pull remote changes from the Apify platform to the current
              directory.

       apify run
              Run an actor locally.

       apify call
              Alias for `apify remote-run create`.

NAMESPACES
       The CLI is organized into several namespaces to manage different
       aspects of the Apify platform.

       actor
              Commands for managing actors locally.

       remote-actor
              Commands for managing actors on the Apify platform.

       build
              Commands for managing actor builds.

       remote-run
              Commands for managing runs on the Apify platform.

       task
              Commands for managing tasks on the Apify platform.

       schedules
              Commands for managing schedules.

       key-value-store
              Commands for managing key-value stores.
              
              Alias: apify kvs

       dataset
              Commands for managing datasets.

       webhook
              Commands for managing webhooks.

       webhook-dispatch
              Commands for dispatching webhooks.

       store
              Commands for managing stores.

ACTOR NAMESPACE
       apify actor info
              Reads the .actor file and logs info.

       apify actor create [name] --template=[]  
              Initializes an Actor template in the specified folder.

       apify actor init [name]
              Initializes an actor in the specified folder.

       apify actor run [--input=INPUT.JSON]
              Runs the actor with the specified input locally.

       apify actor push-data
              Pushes data to the Key-Value store. 

       apify actor get-input
              Retrieves the input for the actor from the "INPUT" Key-Value
              store. 

       apify actor set-value
              Saves data to a Dataset.

       apify actor get-value
              Retrieves data from the Dataset.

       apify actor status [status]
              Sets the status of the actor.

       apify actor exit [exit status]
              Exits the actor.

REMOTE-ACTOR NAMESPACE
       apify remote-actor call [actor-id]
              Runs a remote actor and it wairs for its result.
              API Endpoint: POST /v2/acts/{actorId}/runs
              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

       apify remote-actor start [actor-id]
              Starts a remote actor asynchronously
              API Endpoint: POST /v2/acts/{actorId}/runs
              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

       apify remote-actor ls [--my] [--offset=NUM] [--limit=NUM] [--desc]
              Lists all available user actors.
              API Endpoint: GET /v2/acts

              Optional Parameters:
              --my=BOOL
                     If true, only return actors owned by the user.
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify remote-actor rm [actor-id]
              Removes the specified actor from the platform.
              API Endpoint: DELETE /v2/acts/{actorId}
              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

       apify remote-actor build [actor-id]
              Rebuilds the specified actor on the platform.
              API Endpoint: POST /v2/acts/{actorId}/builds
              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

       apify remote-actor tags [actor-id]
              Lists tags for the remote actor.
              API Endpoint: GET /v2/acts/{actorId}/tags
              TODO: I'm not sure this endpoint exists

              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

TASK NAMESPACE

       apify task create [actor-id]
              Creates a new task.
              API Endpoint: POST /v2/actor-tasks

              Required Parameters:
              actor-id
                     Actor ID or a tilde-separated owner's username and Actor name.

 
       apify task ls [--offset=NUM] [--limit=NUM] [--desc]
              Lists all available user tasks.
              API Endpoint: GET /v2/actor-tasks

              Optional Parameters:
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify task rm [task-id]
              Removes the specified task from the platform.
              API Endpoint: DELETE /v2/actor-tasks/{actorTaskId}
              Required Parameters:
              task-id
                     Task ID.

       apify task schedule [task-id] [--cron=CRON]
              Schedules the specified task.
              API Endpoint: POST /v2/actor-tasks/{actorTaskId}/schedules
              Required Parameters:
              task-id
                     Task ID.
              --cron=CRON
                     Cron string for scheduling.

       apify task run [--task-id=ID]
              Runs the specified task.
              API Endpoint: POST /v2/actor-tasks/{actorTaskId}/runs
              Required Parameters:
              --task-id=ID
                     Task ID.

REMOTE-RUN NAMESPACE
       apify remote-run ls [--active|--finished|--aborted] [--actor-id=ID] [--offset=NUM] [--limit=NUM] [--desc=BOOL]
              Lists remote runs with optional filters.
              API Endpoint: GET /v2/acts/{actorId}/runs

              Optional Parameters:
              --active
                     Filter by active runs.
              --finished
                     Filter by finished runs.
              --aborted
                     Filter by aborted runs.
              --actor-id=ID
                     Actor ID or a tilde-separated owner's username and Actor name.
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify remote-run rm [--run-id=ID]
              Removes the specified run.
              API Endpoint: DELETE /v2/acts/{actorId}/runs/{runId}
              Required Parameters:
              --run-id=ID
                     Run ID.

       apify remote-run attach [--run-id=ID]
              Attaches the stdout of the specified run to the terminal.
              API Endpoint: GET /v2/acts/{actorId}/runs/{runId}/log
              Required Parameters:
              --run-id=ID
                     Run ID.

       apify remote-run resurrect [--run-id=ID]
              Resurrects the specified run.
              API Endpoint: POST /v2/acts/{actorId}/runs/{runId}/resurrect
              Required Parameters:
              --run-id=ID
                     Run ID.

       apify remote-run abort [--run-id=ID]
              Aborts the specified run.
              API Endpoint: POST /v2/acts/{actorId}/runs/{runId}/abort
              Required Parameters:
              --run-id=ID
                     Run ID.

KEY-VALUE-STORE NAMESPACE
       apify kvs create [--name=NAME]
              Creates a named key-value store.
              API Endpoint: POST /v2/key-value-stores
              Optional Parameters:
              --name=NAME
                     Name of the key-value store.

       apify kvs ls [--offset=NUM] [--limit=NUM] [--desc=BOOL]
              Lists available key-value stores.
              API Endpoint: GET /v2/key-value-stores

              Optional Parameters:
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify kvs ls [--kvs-id=ID]
              Lists the contents of the specified key-value store.
              API Endpoint: GET /v2/key-value-stores/{storeId}/records
              Required Parameters:
              --kvs-id=ID
                     Key-value store ID.

       apify kvs rm [--name=NAME]
              Removes the specified key-value store.
              API Endpoint: DELETE /v2/key-value-stores/{storeId}
              Required Parameters:
              --name=NAME
                     Name of the key-value store.

       apify kvs rename [--name=NAME] [--new-name=NEW_NAME]
              Renames the specified key-value store.
              API Endpoint: PUT /v2/key-value-stores/{storeId}
              Required Parameters:
              --name=NAME
                     Name of the key-value store.
              --new-name=NEW_NAME
                     New name for the key-value store.

       apify kvs set [--bucket-id=ID] --key=KEY --value=VALUE
              Sets a value in the specified key-value store.
              API Endpoint: PUT /v2/key-value-stores/{storeId}/records/{recordKey}
              Required Parameters:
              --bucket-id=ID
                     Bucket ID.
              --key=KEY
                     Key for the value.
              --value=VALUE
                     Value to set.

       apify kvs get [--bucket-id=ID] --key=KEY
              Gets a value from the specified key-value store.
              API Endpoint: GET /v2/key-value-stores/{storeId}/records/{recordKey}
              Required Parameters:
              --bucket-id=ID
                     Bucket ID.
              --key=KEY
                     Key for the value.

DATASET NAMESPACE
       apify dataset create [name]
              Creates a new dataset.
              API Endpoint: POST /v2/datasets
              Optional Parameters:
              name
                     Name of the dataset.

       apify dataset ls [--offset=NUM] [--limit=NUM] [--desc=BOOL]
              Lists available datasets.
              API Endpoint: GET /v2/datasets

              Optional Parameters:
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify dataset rm [dataset-id]
              Removes the specified dataset.
              API Endpoint: DELETE /v2/datasets/{datasetId}
              Required Parameters:
              dataset-id
                     Dataset ID.

       apify dataset rename [dataset-id] [new-name]
              Renames the specified dataset.
              API Endpoint: PUT /v2/datasets/{datasetId}
              Required Parameters:
              dataset-id
                     Dataset ID.
              new-name
                     New name for the dataset.

       apify dataset get dataset-id [--limit=NUM] [--offset=NUM] [--format=FORMAT]
              Retrieves data from the specified dataset.
              API Endpoint: GET /v2/datasets/{datasetId}/items

              Required Parameters:
              dataset-id
                     Dataset ID.
              Optional Parameters:
              --limit=NUM
                     Maximum number of records to return.
              --offset=NUM
                     Number of records to skip at the start.
              --format=FORMAT
                     The format of the data (json, csv, xml, etc.).

       apify dataset push dataset-id --value=VALUE
              Pushes data to the specified dataset.
              API Endpoint: POST /v2/datasets/{datasetId}/items
              Required Parameters:
              dataset-id
                     Dataset ID.
              --value=VALUE
                     Value to push.

BUILD NAMESPACE
       apify build create [actor-id]
              Creates a new build for the actor in the current directory 
              or given [actor-id].

              API Endpoint: POST /v2/acts/{actorId}/builds
              Optional Parameters:
              actor-id
                     Actor ID.

       apify build ls actor-id [--offset=NUM] [--limit=NUM] [--desc=BOOL]
              Lists available builds.
              API Endpoint: GET /v2/acts/{actorId}/builds

              Required Parameters:
              actor-id
                     Actor ID.
              Optional Parameters:
              --offset=NUM
                     Number of records to skip at the start.
              --limit=NUM
                     Maximum number of records to return.
              --desc=BOOL
                     If true, sort by createdAt field in descending order.

       apify build log build-id
              Retrieves logs for the specified build.
              API Endpoint: GET /v2/acts/{actorId}/builds/{buildId}/logs
              Required Parameters:
              build-id
                     Build ID.

       apify build tag build-id [--tag=TAG]
              Tags the specified build.
              API Endpoint: POST /v2/acts/{actorId}/builds/{buildId}/tags
              TODO: it think this endpoint doesn't exist
              Required Parameters:
              build-id
                     Build ID.
              --tag=TAG
                     Tag name.

EXAMPLES
       apify init
              Initialize a new Apify project.

       apify create my-actor
              Create a new Apify actor named 'my-actor'.

       apify push
              Push local changes to the Apify platform.

       apify run
              Run an actor locally.

       apify actor create my-actor --template=basic  
              Create a new actor from the 'basic' template.

       apify remote-run ls --active
              List all active remote runs.

SEE ALSO
       For more information, visit the Apify CLI documentation at:
       https://github.com/apify/apify-cli

AUTHORS
       Apify Technologies
```
