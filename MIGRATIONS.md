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
