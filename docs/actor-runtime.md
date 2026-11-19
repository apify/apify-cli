---
title: Actor runtime
description: Run a local Apify platform with the Apify CLI to develop and test Actors without the cloud.
---

:::caution Experimental

The Actor runtime is experimental. The `apify runtime` commands, and what they add to other commands, might change in future releases.

:::

The Actor runtime is a self-contained local Apify platform that runs as a container on Docker or Podman. It serves an Apify-compatible API and a web Console, so you can push, build, and run Actors on your machine.

## Prerequisites

Docker or Podman must be installed and running:

- Docker Desktop (macOS, Windows, Linux desktop): [Get Docker](https://docs.docker.com/get-started/get-docker/)
- Docker Engine (Linux servers, headless): [Install Docker Engine](https://docs.docker.com/engine/install/)
- Podman (rootful or rootless): [Podman installation](https://podman.io/docs/installation). Its API socket must be served, for example with the `podman.socket` systemd unit.

The CLI uses the first engine it finds on `PATH`, Docker before Podman. To choose one, set `APIFY_CONTAINER_ENGINE=docker` or `APIFY_CONTAINER_ENGINE=podman`.

## Install and start the runtime

```bash
apify runtime install
apify runtime start --detach
apify runtime status
```

`apify runtime install` checks that the engine is available and downloads the runtime image. `apify runtime start` runs it, and `apify runtime status` tells you whether it's up.

The runtime publishes two ports on localhost:

| Port | Service | URL |
| --- | --- | --- |
| 3333 | API | `http://localhost:3333` |
| 3000 | Console | `http://localhost:3000` |

To use other ports, run `apify runtime start --api-port <port> --console-port <port>`. The CLI remembers them for later starts and for `apify runtime connect`.

## Send CLI commands to the runtime

To send all Apify CLI commands to the runtime instead of the Apify platform, run:

```bash
apify runtime connect
```

The connection applies in every terminal and doesn't change your login. To go back to the Apify platform, run `apify runtime disconnect`.

To target the runtime in one shell only, set these environment variables. They also apply to the Apify SDKs and API clients, and they override `apify runtime connect` wherever they're set:

```bash
export APIFY_CLIENT_BASE_URL=http://localhost:3333
export APIFY_CONSOLE_URL=http://localhost:3000
```

Unset them to let `apify runtime connect` decide where commands go.

## Develop with a live dev folder

When the CLI targets the runtime, `apify push` also registers the pushed directory as the Actor's live dev folder. Runs then pick up local edits without another push. To run from the built image alone, use `apify call --no-dev-folder`.

## Agent Skill

The runtime ships an Agent Skill that teaches coding agents how to use it. To print it, run `apify runtime skill`. To install it for the agents on your machine, run `apify runtime skill --install`.
