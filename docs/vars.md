---
description: Learn how to define environment variables for your Actors using the Apify CLI.
title: Environment variables
---

You can use the CLI to set environment variables for your Actors.

For the list of the system variables that Apify provides, see [Environment variables](https://docs.apify.com/actors/development/programming-interface/environment-variables).

## Custom environment variables

To pass additional configuration to your Actor, define custom environment variables.

### Define in `.actor/actor.json`

To set custom variables, add them to the `environmentVariables` object in `.actor/actor.json` and push the Actor to Apify:

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

Variables defined in `.actor/actor.json` override the ones defined in Apify Console.

### Define in Apify Console

To set custom variables in Apify Console:

1. Log in to [Apify Console](https://console.apify.com).
1. In the left-side panel, go to **Development** > **My Actors**.
1. From the table, select the Actor you want to configure.
1. Go to the **Source** tab > **Code**.
1. Expand the **Environment variables** section.

Once done, delete `environmentVariables` from `.actor/actor.json`. Variables defined in that file override the ones defined in Apify Console.

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest"
}
```

### Define secrets

You can use the CLI to manage secrets environment variables:

1. To add a secret, use the `apify secrets add` command. All secrets are stored in the `~/.apify` directory.

    ```bash
    apify secrets add mySecretPassword pwd1234
    ```

1. To reference the secret in `.actor/actor.json`, use the `@` prefix:

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

## CLI environment variables

Use the following environment variables to configure the CLI.

### `APIFY_CONSOLE_URL`

Changes the base URL of Apify Console that the CLI prints and opens. For example, the run, build, dataset and key-value store URLs, or the browser page for the `apify login` flow.

The default value is `https://console.apify.com`.

To point the CLI at a local Console instance during development, use:

```bash
export APIFY_CONSOLE_URL=http://localhost:3000
```

Note that if `APIFY_CONSOLE_URL` points at `localhost`, `apify login` validates your token against `http://localhost:3333`. All other commands still call the production API at `https://api.apify.com`.

