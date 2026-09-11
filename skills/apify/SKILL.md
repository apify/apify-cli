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

See https://apify.com/auth.md for how to authenticate. Do not assume `APIFY_TOKEN` is already set in the environment and use it implicitly — confirm with the user first.

- Persist a session explicitly: `apify login --token <token>`.
- Verify auth: `apify info` (prints the logged-in user; non-zero exit / error if not authenticated).
- Print the stored token: `apify auth token`.

## Structured output

- `--json` is supported on most list/info commands (`apify actors ls --json`, `apify actors info <id> --json`, `apify datasets info <id> --json`, `apify runs ls --json`, etc.). Use it and parse with `jq`; don't scrape the human table.
- `apify create <name> --template <template> --json` prints `{ dir, actorJsonPath, template, source, nextSteps, postCreate, gitRepositoryInitialized }` on stdout. Everything else goes to stderr, so stdout is safe to pipe into `jq`. `postCreate` is non-null when the template needs extra setup before `apify run` works.
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

Pricing matters, but weigh it alongside popularity, rating, and how well-maintained the Actor is — don't pick a `FREE` Actor over a well-supported, popular, highly-rated one just because it's free. Check an Actor's pricing before running it with `apify actors info <actor> --json` (look at `currentPricingInfo`).

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

## Local Actor runtime

`apify runtime` runs a self-contained local Apify platform as a container on Docker or Podman. Use it to develop and test Actors against a platform-compatible API without touching the user's cloud account. It ships on the `runtime` npm dist-tag, not on `latest`.

**Prerequisite: Docker or Podman.** One of them must be installed and running before any `apify runtime` command works; the CLI does not install either. It uses the first engine found on PATH (Docker before Podman); `APIFY_CONTAINER_ENGINE=podman` forces Podman.

With Podman, the API socket must be served: check with `podman info --format '{{.Host.RemoteSocket.Exists}}'` (must print `true`). If it does not, run `systemctl --user enable --now podman.socket` (rootless) or `sudo systemctl enable --now podman.socket` (rootful); without systemd, `podman system service --time=0 &`. On macOS/Windows, `podman machine start` first. Rootful and rootless Podman both work.

With Docker, check with `docker info` and act on what it tells you:

- `docker info` succeeds - you are ready.
- It fails with "Cannot connect to the Docker daemon" (or similar) - Docker is installed but not running. Do not reinstall it; start the daemon:
  - Docker Desktop (macOS, Windows): start the Docker Desktop app and wait until it reports running.
  - Linux with systemd: `sudo systemctl start docker`.
  - Sandboxes and containers without systemd (common for agent environments): `dockerd` is usually present but nothing starts it. iptables and IP forwarding are often unavailable there, so start it without them, then poll until the daemon answers:

    ```sh
    if ! docker info >/dev/null 2>&1; then
      nohup dockerd --iptables=false --ip6tables=false > dockerd.log 2>&1 &
      until docker info >/dev/null 2>&1; do sleep 1; done
    fi
    ```

    Keep the default bridge network - `apify runtime start` publishes ports 3333 and 3000 with `-p`, which needs it. If `docker info` never succeeds, read `dockerd.log` before trying anything else.
- The `docker` command is missing - installation differs per OS and can need admin rights, so do not improvise it. Point the user at the official Docker docs and let them pick the right path:
  - Docker Desktop (macOS, Windows, Linux desktop): https://docs.docker.com/get-started/get-docker/
  - Docker Engine (Linux servers, headless): https://docs.docker.com/engine/install/

`apify runtime install` runs the same engine checks and prints a platform-specific hint when something is missing. It installs `apify/actor-runtime:latest` unless another image is given (for example `apify runtime install apify/actor-runtime:master-5462005` for a pinned build); `apify runtime start` runs whichever image was installed last. Only name an image when the user asks for a specific one.

**Working directory.** Install the preview CLI locally in one dedicated directory rather than globally, so it cannot replace the user's stable `apify` install. Keep the runtime data and the Actor projects you create in the same directory - everything the session produced is then in one place and easy to clean up:

```sh
mkdir -p apify-runtime-work && cd apify-runtime-work
npm init -y >/dev/null && npm i apify-cli@runtime
APIFY=./node_modules/.bin/apify        # use $APIFY for every command below
```

**Start it and point the CLI at it.** The runtime publishes two ports on `localhost`. Export these variables in the shell you drive the CLI from (they are the same values `apify runtime -h` and `apify runtime start` print):

| Port | Service | Environment variable | Value |
| ---- | ------- | -------------------- | ----- |
| 3333 | API (Apify API compatible) | `APIFY_CLIENT_BASE_URL` | `http://localhost:3333` |
| 3000 | Console (web UI) | `APIFY_CONSOLE_URL` | `http://localhost:3000` |

```sh
export APIFY_CLIENT_BASE_URL=http://localhost:3333
export APIFY_CONSOLE_URL=http://localhost:3000
export APIFY_DISABLE_KEYRING=1

$APIFY runtime install
$APIFY runtime start --detach --data-dir ./runtime-data   # omit --detach to run in the foreground (Ctrl+C stops it)
$APIFY login --token local-dev-token                      # the runtime accepts any token
$APIFY actors ls --json                                   # now talks to the local runtime
$APIFY runtime stop
```

`APIFY_DISABLE_KEYRING=1` makes `apify login` store the token in `~/.apify/auth.json` instead of the OS keyring. Set it for agent flows: sandboxes rarely have a keyring, and the runtime token is a throwaway placeholder anyway, so there is nothing worth protecting. Note that this login still replaces whatever credentials `~/.apify/auth.json` held - fine in a throwaway sandbox, but on a developer's machine ask first or have the user run `apify login` with their real token afterwards.

Every `apify` command in that shell (`push`, `call`, `actors`, `datasets`, `api`, ...) then targets the runtime. Unset the variables (or start a new shell) to talk to the Apify cloud again. Do not set them globally for the user without asking - they silently redirect all API traffic.

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
