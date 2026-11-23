---
description: Learn how to manage environment variables for your Actors with a local .env file and the apify env commands.
title: Environment variables
---

Your Actor's custom environment variables (env vars) live in two places, and each place is the source of truth for its side:

- **Locally**, in a `.env` file in the Actor directory. `apify run` loads it.
- **On the Apify platform**, on an Actor version. Runs on the platform use these values. Manage them with the `apify env` commands or in Apify Console.

The `apify env` commands move values between the two and show where they differ. `apify push` deploys code only and never changes the platform env vars.

For the list of the system variables that Apify provides, see [Environment variables](https://docs.apify.com/actors/development/programming-interface/environment-variables).

## Local values in `.env`

Put the `.env` file in the Actor directory, next to the `.actor` folder. Write one `NAME=value` line per variable:

```text
# .env
MYSQL_USER=my_username
MYSQL_PASSWORD='p4ss word'
```

- Values are literal. `@name` isn't a secret reference, and `$OTHER` isn't expanded. Lines that start with `#` are comments, and an `export ` prefix is allowed.
- Quote a value that contains spaces or `#`. Single quotes and backticks keep the value as written and can span lines. Double quotes turn `\n` into a new line.
- When a key appears twice, the last line wins.
- A name can only have letters, digits, and underscores, and can't start with a digit. A line that isn't empty, a comment, or a `NAME=value` assignment with such a name is malformed. `apify run`, `apify env pull`, and `apify env migrate` skip malformed lines and warn with their line numbers, never their content. `apify env push` and `apify env diff` stop with an error instead. Quote a value that spans several lines, or its other lines are malformed.

### Precedence in `apify run`

`apify run` sets these variables for the Actor, from lowest to highest priority:

1. Your shell environment.
1. The variables the CLI sets for the run, such as `APIFY_TOKEN` and the input key.
1. `.env`.

`.env` wins over every other source, including the variables the CLI sets.

### `.env` stays on your machine

- `apify push` never uploads `.env` or `.env.*` files, including the ones in subfolders and in `.actor`. `.env.example` is the only exception, so you can share a template with placeholder values. A `!.env` line in `.actorignore` doesn't bring `.env` back.
- `apify init` and `apify create` add `.env` to `.gitignore`. `apify env pull` and `apify env migrate` add it, too, before they write the file.
- `apify env pull` and `apify env migrate` create a new `.env` that only you can read (on macOS and Linux). When Git already tracks `.env`, they warn you, because `.gitignore` doesn't keep a tracked file out of commits. Run `git rm --cached .env` to stop tracking it.

Some Python projects name their virtual environment folder `.env`. `apify run` ignores a `.env` folder. The commands that write `.env` stop with an error until you rename the folder, for example to `.venv`.

## Manage env vars with `apify env`

| Command | What it does |
| --- | --- |
| `apify env ls` | Lists the env vars of an Actor version. Secret values stay hidden. |
| `apify env set <name>` | Creates or updates one env var. Reads the value from a prompt or standard input. |
| `apify env rm <name>` | Deletes one env var. |
| `apify env push` | Uploads `.env` to the Actor version. |
| `apify env pull` | Writes the env vars of the Actor version into `.env`. |
| `apify env diff` | Compares `.env` with the Actor version. |
| `apify env migrate` | Moves `environmentVariables` from `.actor/actor.json` into `.env`. |

All commands except `apify env migrate` need you to log in first. For the full list of flags, see the [command reference](./reference.md#actor-environment-variables) or run `apify env <command> --help`.

### Choose the Actor and version

Env vars belong to an Actor version, so each command except `apify env migrate`, which takes only `--dir`, first picks the Actor and the version:

- **Actor**: the one in `.actor/actor.json` in the current directory. Pass `--dir <path>` to pick an Actor folder in a monorepo; the command then reads `.actor/actor.json` and `.env` from that folder. Pass `--actor <ID or username/name>` to target an Actor without a local project.
- **Version**: `--version <number>`, then `version` from `.actor/actor.json`, then `0.0`. This is the order `apify push` uses. With `--actor`, the local `.actor/actor.json` is ignored, so the version is `--version` or `0.0`.

### List env vars

```bash
apify env ls
apify env ls --actor username/my-actor --version 1.0 --json
```

The table shows plain values and `hidden` for secrets.

### Set one env var

```bash
apify env set API_KEY --secret
```

In a terminal, the command prompts for the value and hides what you type when the variable is a secret. In a script, pipe the value through standard input:

```bash
printf '%s' "$API_KEY" | apify env set API_KEY --secret
```

The value never comes from an argument, so it stays out of your shell history. A new variable is plain unless you pass `--secret`. An existing variable keeps its type unless you pass `--secret` or `--no-secret`.

### Delete an env var

```bash
apify env rm API_KEY
```

The command asks for confirmation. Pass `--yes` to skip it.

### Upload `.env`

```bash
apify env push
```

The command shows the changes and asks before it makes them:

```text
Changes to username/my-actor version 0.0:
  + NEW_VAR (secret)
  ~ API_KEY (secret, replaced: secret values can't be compared)
  ~ CHANGED_VAR
Unchanged: LOG_LEVEL
Only on the platform, kept: OLD_VAR. Pass --prune to delete.
```

- It adds new variables and updates changed ones. Pass `--prune` to also delete the variables that aren't in `.env`.
- New variables are secrets. Pass `--plain` to create them as plain variables. Existing variables keep their type.
- Keys with an empty value are skipped.
- It skips the variables whose name can't be in `.env`, such as `MY-VAR`, and names them in a warning. `--prune` doesn't delete them.
- Pass `--yes` to skip the prompt, for example in CI.

When one variable fails, the command still applies the others, reports each result, and exits with 1.

When `.env` has malformed lines, the command changes nothing and exits with 5. The error names the malformed lines by number only.

### Download into `.env`

```bash
apify env pull
```

The command writes the env vars of the Actor version into `.env`:

- Without a `.env`, it creates one, unless the version has no env vars.
- With an existing `.env`, it shows the changes and asks first. It updates plain variables, and keeps comments, keys that exist only locally, and the local value of secrets. Pass `--yes` to skip the prompt.
- It skips the variables whose name can't be in `.env`, such as `MY-VAR`, and names them in a warning.

### Compare `.env` with the platform

```bash
apify env diff
```

The command lists the keys that exist only in `.env`, the keys that exist only on the platform, and the plain variables whose values differ:

```text
.env and username/my-actor version 0.0 differ:
  Only in .env:
    + NEW_VAR
  Only on the platform:
    - OLD_VAR
  Different values:
    ~ LOG_LEVEL
```

It exits with 0 when `.env` and the Actor version are in sync and with 1 on any difference. With `--json`, it prints `inSync`, `onlyInDotEnv`, `onlyOnPlatform`, and `valuesDiffer`. The output never contains values.

It skips the variables whose name can't be in `.env`, such as `MY-VAR`, and names them in a warning.

When `.env` has malformed lines, the command compares nothing and exits with 5. The lines of an unquoted value that spans several lines can look like `NAME=value`, so their text would show up as names. The error names the malformed lines by number only.

## Secrets

A secret env var is write-only: no one can read its value back, neither in Apify Console nor through the API. The commands handle secrets like this:

- `apify env ls` shows `hidden` instead of the value.
- `apify env pull` writes a secret's key with an empty value, because the value can't be read. When `.env` already has a value for it, the local value stays.
- `apify env push` skips keys with an empty value, so a pulled `.env` doesn't blank your secrets. It replaces every secret that has a value in `.env`, because it can't tell whether the value changed.
- `apify env diff` compares secrets by name only. A secret that's in `.env`, also with an empty value, counts as in sync.

## Rebuild after a change

Runs use the env vars that were copied onto the build when it was made. After you change the platform env vars, with `apify env` or in Apify Console, rebuild the Actor before runs see the change:

```bash
apify builds create --version 0.0
```

Pass the version you changed. `apify env set`, `apify env rm`, and `apify env push` print this command with the Actor and version filled in.

## `apify push` after an env var change

Every env var change updates the Actor's modification time on the platform. `apify push` refuses to overwrite an Actor that has newer changes than your local files, so when you haven't changed any local file since the env var change, the next push stops with "has newer changes than your local copy". Pass `--force` to push anyway:

```bash
apify push --force
```

## Move an existing project

If your project keeps its variables in `environmentVariables` in `.actor/actor.json`, move them to `.env` and the platform:

1. Run `apify env migrate`. It shows what moves and asks first. Then it writes the values to `.env`, resolves `@secret` references from the local secrets store, adds `.env` to `.gitignore`, and removes `environmentVariables` from `.actor/actor.json`. Keys already in `.env` keep their value. The local secrets store is `~/.apify/secrets.json`, which `apify secrets add` wrote in earlier CLI versions. When a referenced secret isn't in it, the command stops; pass `--allow-missing-secrets` to write its key with an empty value instead. When a name can't be in `.env`, the command stops and changes nothing; rename the variable in `.actor/actor.json` first.
1. Run `apify env push` to set the values on the platform. Variables that exist only in Apify Console stay unless you pass `--prune`.

```bash
apify env migrate
apify env push
```

## Removed features

- **`apify push` doesn't upload env vars.** It used to send `environmentVariables` from `.actor/actor.json` and replace the whole list on the Actor version, which deleted the variables set only in Apify Console. Now it never changes the platform env vars, and the variables already there stay as they are.
- **`environmentVariables` in `.actor/actor.json`** isn't supported anymore. When the object isn't empty, `apify run` and `apify push` stop with an error that points to `apify env migrate`. An empty `{}` is ignored. Use `.env` instead.
- **`@secret` references, `apify secrets`, and `--allow-missing-secrets` on `apify run` and `apify push`** are removed. Use `.env` for local values, and `apify env set --secret` or `apify env push` for platform values.

For the upgrade steps, see [MIGRATIONS.md](https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md).

## Apply env vars to the build

By default, the Actor version's env vars on the Apify platform are available only at runtime. To make them available also to the Actor build process, for example, as Docker build arguments, set `applyEnvVarsToBuild` in `.actor/actor.json`:

```json
{
  "actorSpecification": 1,
  "name": "dataset-to-mysql",
  "version": "0.1",
  "buildTag": "latest",
  "applyEnvVarsToBuild": true
}
```

To apply the env vars to a single push, add the `--apply-env-vars-to-build` flag to the `apify push` command. To turn off the setting for a single push, add the `--no-apply-env-vars-to-build` flag. The flag overrides the value of the `applyEnvVarsToBuild` field. If you use neither the field nor a flag, the Apify platform keeps the stored setting.

`applyEnvVarsToBuild` is a build setting, not a value, so `apify push` still sends it.

## Check for drift in a pre-commit hook and CI

`apify env diff` exits with 1 when `.env` and the platform differ, so you can use it as a check. For example, as a Git pre-commit hook:

```sh
#!/bin/sh
# .git/hooks/pre-commit
apify env diff || { echo "The platform env vars differ from .env. Run apify env push or apify env pull."; exit 1; }
```

Make the hook executable with `chmod +x .git/hooks/pre-commit`. The hook runs in the repository root, so in a monorepo add `--dir <path>` for each Actor. It also stops the commit when the check can't run, for example when you aren't logged in; the error above the message says why.

In CI, `.env` isn't in the repository, because it's gitignored. Create it before `apify env diff` runs, for example from your CI provider's secrets, and log in, for example by setting `APIFY_TOKEN`. Without a `.env`, or with malformed lines in it, `apify env diff` fails with exit code 5.
