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

### Pass variables on the command line

For one-off pushes (for example in CI), pass variables directly to `apify push` with the repeatable `--env` flag:

```bash
apify push --env MYSQL_USER=my_username --env MYSQL_PASSWORD=@mySecretPassword
```

The values are merged with `environmentVariables` from `.actor/actor.json`; when a key is defined in both, the `--env` value wins. The `@` prefix references stored secrets the same way as in the file.

:::caution

Pushing with `--env` (just like pushing with `environmentVariables` in `.actor/actor.json`) replaces the full list of environment variables stored on the platform. Variables set only in Apify Console are removed — include them in `.actor/actor.json` or `--env` if you want to keep them.

:::

### Apply environment variables to the build

By default, custom environment variables are available only at runtime. To make them available also to the Actor build process, for example, as Docker build arguments, set `applyEnvVarsToBuild` in `.actor/actor.json`:

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest",
  "applyEnvVarsToBuild": true,
  "environmentVariables": {
    "MYSQL_PASSWORD": "@mySecretPassword"
  }
}
```

To apply the environment variables to a single push, add the `--apply-env-vars-to-build` flag to the `apify push` command. To turn off the setting for a single push, add the `--no-apply-env-vars-to-build` flag. The flag overrides the value of the `applyEnvVarsToBuild` field. If you don't use a flag, the Apify platform keeps the stored setting.
