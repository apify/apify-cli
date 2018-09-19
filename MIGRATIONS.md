# Migration from 0.1.* to 0.2.*

## Breaking change 1: Change default apify storage directory name (apify_local -> apify_storage)

If you are using apify local storage in your project you need to rename storage directories:

1. `apify_local` -> `apify_storage`
2. `apify_local/key-value-stores` -> `apify_storage/key_value_stores`
3. `apify_local/request-queues` -> `apify_storage/request_queues`

## Breaking change 2: Change the way how CLI starts node process with `apify run` command

CLI uses `npm start` to run local actor instead of `node main.js` in 0.2.* .
If you want to run your project after updating to 0.2.*, you need to add start script `node main.js` to your package.json into scripts field.

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
