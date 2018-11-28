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

CLI uses `npm start` to run actor instead of `node main.js` in version 0.2.* .
If you want to run your project after updating to 0.2.*, you need to add start script `node main.js` to the scripts field of package.json.

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
