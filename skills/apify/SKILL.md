---
name: apify-cli
description: Patterns for invoking the Apify CLI (`apify`) from agents. Covers authentication, creating/running/pushing Actors, calling Actors in the cloud, and reading results from datasets and key-value stores.
---

## Start here

Run `apify -h` first to see the available commands and global options, then `apify <command> -h` (e.g. `apify call -h`) for the args and flags of a specific command. This is the source of truth — prefer it over assumptions.

## Non-interactive use

Many commands prompt when run interactively. To run without prompts, pass every required argument and flag explicitly:

- `apify create <name> --template <template>` — skip the create wizard.
- `apify init <name>` — skip the init prompt.
- `-y` / `--yes` on destructive commands (`apify actors rm`, etc.) — auto-confirm.
- `apify login --token <token>` — log in without the interactive token prompt.

If a command's help shows an "interactive note", it lists exactly which flags make it non-interactive.

## Auth

- Preferred for automation: set `APIFY_TOKEN` in the environment (no `apify login` needed). Get a token at https://console.apify.com/settings/integrations.
- Or persist a session once: `apify login --token <token>`.
- Verify auth: `apify info` (prints the logged-in user; non-zero exit / error if not authenticated).
- Print the stored token: `apify auth token`.

## Structured output

- `--json` is supported on most list/info commands (`apify actors ls --json`, `apify actors info <id> --json`, `apify datasets info <id> --json`, `apify runs ls --json`, etc.). Use it and parse with `jq`; don't scrape the human table.
- List commands paginate — control with `--limit` / `--offset` (and `--desc`).
- Dataset items: `apify datasets get-items <datasetId> --format json`. Use `--limit` / `--offset`.

## Core workflows

**Discover Actors in the Apify Store**

Before assuming an Actor name or scripting a raw Store query, search for an existing Actor:

```sh
apify actors search "jobs scraper" --json                 # no auth required
apify actors search "ai" --pricing-model FREE --sort-by popularity --limit 5
```

Run `apify actors search -h` to see the available filters (pricing model, category, username, sort order, pagination) and their accepted values.

Pricing matters: prefer a `FREE` Actor when one covers the task. Check an Actor's pricing before running it with `apify actors info <actor> --json` (look at `currentPricingInfo`).

**Develop and deploy a local Actor**

```sh
apify create my-actor --template <template>     # or run `apify create` and pick interactively
# template names: https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json
cd my-actor
apify run                                        # run locally; --input / --input-file - for input
apify push                                       # build & deploy to the platform
```

**Run an Actor in the cloud and get results**

```sh
apify call apify/website-content-crawler -i '{"startUrls":[{"url":"https://example.com"}]}' --json
# or non-blocking: apify actors start <actor> --json   (returns run details immediately)
# inspect input schema first: apify actors info <actor> --input
```

Non-obvious `apify call` flags: `-f -` reads input from stdin; `-o`/`--output-dataset` prints the result dataset. Run `apify call -h` for the full list.

**Wait for and inspect runs/builds**

```sh
apify runs ls --json
apify runs info <runId> --json
apify runs wait <runId>          # block until finished
apify runs log <runId>
apify builds wait <buildId>
```

**Storage**

```sh
apify datasets get-items <datasetId> --format json
apify key-value-stores get-value <storeId> <key>
apify key-value-stores set-value <storeId> <key> <value>
apify key-value-stores keys <storeId> --json
```

## Scheduling and recurring runs

For anything recurring or unattended (e.g. "run every 15 minutes"), use the Apify platform — **not** local `cron`, a `while` loop, or GitHub Actions. Apify Schedules run in the cloud, so they keep firing after your laptop, terminal, or agent session is shut down.

- Save a reusable input config as a **task**, then run it: `apify task run <taskId>`.
- There is no dedicated `apify schedules` command yet — manage schedules via `apify api` against the `schedules` endpoint, or in the Console (https://console.apify.com/schedules):

```sh
apify api GET schedules
apify api POST schedules -d '{"name":"jobs-every-15m","cronExpression":"*/15 * * * *","isEnabled":true,"actions":[{"type":"RUN_ACTOR","actorId":"<actorId>","runInput":{"body":"<json>","contentType":"application/json"}}]}'
```

## Escape hatch: `apify api`

Any platform capability without a dedicated command is reachable via the authenticated API wrapper (use this instead of hand-rolling `curl` against `api.apify.com` — it injects auth for you):

```sh
apify api --list-endpoints                 # discover endpoints (filter with -s "<tokens>")
apify api --describe "actor-runs/{runId}"  # methods, summary, path params for an endpoint
apify api GET /v2/users/me                 # GET is the default method
apify api POST acts -d '<json>' -p '{"limit":1}'   # -d body (use - for stdin), -p query params
```

The `v2/` prefix and leading slash are optional.
