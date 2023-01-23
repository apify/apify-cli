---
sidebar_label: Environment variables
title: Environment variables
---

There are two options how you can set up environment variables for actors.

### Set up environment variables in `.actor/actor.json`
All keys from `env` will be set as environment variables into Apify platform after you push actor to Apify. Current values on Apify will be overridden.
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
In [Apify Console](https://console.apify.com/actors) select your actor, you can set up variables into Source tab.
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
apify secrets:add mySecretPassword pwd1234
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

### Need help?

To see all CLI commands simply run:

```bash
apify help
```

To get information about a specific command run:

```bash
apify help COMMAND
```

Still haven't found what you were looking for? Please go to [Apify Help center](https://www.apify.com/help)
or [contact us](https://www.apify.com/contact).
