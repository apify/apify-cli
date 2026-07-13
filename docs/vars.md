---
description: Learn how use environment variables for Apify CLI
title: Environment variables
---

There are two options how you can set up environment variables for Actors.

### Set up environment variables in `.actor/actor.json`

All keys from `environmentVariables` will be set as environment variables into Apify platform after you push Actor to Apify. Current values on Apify will be overridden.

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest",
  "environmentVariables": {
    "MYSQL_USER": "my_username",
    "MYSQL_PASSWORD": "@mySecretPassword"
  }
}
```

### Set up environment variables in Apify Console

In [Apify Console](https://console.apify.com/actors) select your Actor, you can set up variables into Source tab.
After setting up variables in the app, remove the `environmentVariables` from `.actor/actor.json`. Otherwise, variables from `.actor/actor.json` will override variables in the app.

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest"
}
```

#### How to set secret environment variables in `.actor/actor.json`

CLI provides commands to manage secrets environment variables. Secrets are stored to the `~/.apify` directory.
You can add a new secret using the command:

```bash
apify secrets add mySecretPassword pwd1234
```

After adding a new secret you can use the secret in `.actor/actor.json`.

```text
{
    "actorSpecification": 1,
    "name": "dataset-to-mysql",
    ...
    "environmentVariables": {
      "MYSQL_PASSWORD": "@mySecretPassword"
    },
    ...
}
```

## Environment variables that configure the CLI

The variables above configure your **Actors** on the Apify platform. The following variables instead configure the **`apify` CLI itself**. Most users never need them — they are useful when pointing the CLI at a non-production Apify environment, such as a staging deployment or a local instance during development.

### `APIFY_CLIENT_BASE_URL`

Overrides the base URL of the Apify API the CLI talks to. When unset, the CLI uses the production API at `https://api.apify.com`. The Apify Console links the CLI prints follow this value (see `APIFY_CONSOLE_URL` below).

### `APIFY_CONSOLE_URL`

Overrides the base URL of [Apify Console](https://console.apify.com) used whenever the CLI prints links — run, build, dataset and key-value store URLs, the `apify login` browser flow, and so on.

When unset, the Console URL is derived automatically:

- If `APIFY_CLIENT_BASE_URL` is set, its `api.` host is swapped for `console.` (for example `https://api.apify-staging.com` becomes `https://console.apify-staging.com`).
- Otherwise the production Console at `https://console.apify.com` is used.

Set it explicitly when the automatic derivation does not apply, for example a local Console instance during development:

```bash
export APIFY_CONSOLE_URL=http://localhost:3000
```

When the resolved Console is a localhost instance, the CLI also talks to the local API at `http://localhost:3333` by default, so you do not have to set `APIFY_CLIENT_BASE_URL` separately. Set `APIFY_CLIENT_BASE_URL` only to point the API somewhere other than that default.
