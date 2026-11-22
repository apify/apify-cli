# Migration from 1.13.x to 1.14.0

## Breaking change: apify push no longer uploads environmentVariables

`apify push` used to send `environmentVariables` from `.actor/actor.json` to the Actor version on the Apify platform. That replaced the whole list of the version's env vars, so variables set only in Apify Console were deleted on every push.

Now `apify push` deploys code only and never changes the platform env vars. CLI-pushed Actors and Actors built from a Git repository behave the same. `environmentVariables` in `.actor/actor.json` still applies to `apify run`.

If you set platform env vars only through `apify push`, set them another way:

1. Run `apify env migrate`, then `apify env push`. `apify env migrate` moves `environmentVariables` into a `.env` file next to the `.actor` folder, resolves `@secret` references from the local secrets store, adds `.env` to `.gitignore`, and removes the block from `.actor/actor.json`. `apify env push` then sets the values on the platform.
1. Or put the values in a `.env` file next to the `.actor` folder, one `NAME=value` line per variable, and run `apify env push`. New variables are created as secrets; pass `--plain` to create them as plain variables.
1. Or set them one by one with `apify env set NAME` (add `--secret` for a secret), or in Apify Console.

Env vars that are already on the platform stay as they are, so an Actor keeps working until you change them.

Other changes:

- `applyEnvVarsToBuild` (the field in `.actor/actor.json` and the `--apply-env-vars-to-build` flag) still applies. It's a build setting, not a value, so `apify push` keeps sending it.
- `--allow-missing-secrets` on `apify push` has no effect and prints a warning. `apify run` still uses it.
- When `.actor/actor.json` has a non-empty `environmentVariables`, `apify push` prints a warning that the values apply to local runs only.

# Migration from 0.9.x to 0.10.0

## Breaking change: deprecating apify.json in favor of .actor/actor.json

The actor config previously stored in `apify.json` has been deprecated in favor of `.actor/actor.json`. The new config
follows a very similar structure, and it looks like this:

```json
{
  "actorSpecification": 1,
  "name": "name-of-my-scraper", // same as before
  "version": "0.0", // same as before
  "buildTag": "latest", // same as before
  "environmentVariables": {}, // same as 'env' field before
  "dockerfile": "./Dockerfile", // if omitted, it checks "./Dockerfile" and "../Dockerfile"
  "readme": "./ACTOR.md", // if omitted, it checks "./ACTOR.md", "./README.md" and "../README.md"
  "input": "./input_schema.json", // either embedded object or path to json. If omitted, it checks ./INPUT_SCHEMA.json and ../INPUT_SCHEMA.json
  "storages": {
    "dataset": "./dataset_schema.json" // either embedded object or path to json
  }
}
```

When running any CLI script that uses the config, you will be prompted to automatically migrate the old format to the new format in order to proceed.
Alternatively, you can always update it manually. The old config `apify.json` can be safely deleted after migration unless you store in there some
information specific for your use case.

All commands will then honor the new config stored in `.actor/actor.json`.

# Migration from 0.2.x to 0.3.0

## Breaking change 1: Simplified apify.json

Before commands apify run and apify push CLI will ask if you want to migrate your current apify.json to a new structure.
You can simply confirm that and apify.json will be updated to a new structure.

You can do it manually with these steps:

1. Remove attributes `actId`.
2. Replace the value of attribute `version` with the value from `version.versionNumber`.
3. Move attribute `buildTag` to the root of JSON.
4. Create attribute `env` and convert there array from `version.envVars`. All values under `name` will be keys and values from `value` will be values of `env` object.

### Old apify.json structure

```json
{
  "name": "dataset-to-mysql",
  "actId": "drobnikj/dataset-to-mysql",
  "version": {
    "versionNumber": "0.1",
    "buildTag": "latest",
    "envVars": [
      {
        "name": "MYSQL_USER",
        "value": "my_username"
      },
      {
        "name": "MYSQL_PASSWORD",
        "value": "my_secret_password"
      }
    ],
    "sourceType": "TARBALL",
    "tarballUrl": "https://api.apify.com/v2/key-value-stores/something/records/dataset-to-mysql-0.1.zip?disableRedirect=true"
  },
  "template": "basic"
}
```

### New apify.json structure

```json
{
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest",
  "env": {
    "MYSQL_USER": "my_username",
    "MYSQL_PASSWORD": "@mySecretPassword"
  },
  "template": "basic"
}
```

# Migration from 0.1.x to 0.2.0

## Breaking change 1: Changed apify local storage directory name

Default local directory name used for apify storage has changed from `apify_local` to `apify_storage`.
If you are using apify local storage in your project then you need to rename storage directories:

1. `apify_local` -> `apify_storage`
2. `apify_local/key-value-stores` -> `apify_storage/key_value_stores`
3. `apify_local/request-queues` -> `apify_storage/request_queues`

## Breaking change 2: Command `apify run` now starts actor with `npm start`

CLI uses `npm start` to run actor instead of `node main.js` in version 0.2._ .
If you want to run your project after updating to 0.2._, you need to add start script `node main.js` to the scripts field of package.json.

```text
{
    ...
    "scripts": {
        "start": "node main.js",
        "test": "echo \"Error: no test specified\" && exit 1"
    },
    ...
}
```
