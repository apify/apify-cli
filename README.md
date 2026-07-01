# Apify CLI

[![NPM version](https://badge.fury.io/js/apify-cli.svg)](https://www.npmjs.com/package/apify-cli)
[![GitHub workflow](https://github.com/apify/apify-cli/actions/workflows/check.yaml/badge.svg)](https://github.com/apify/apify-cli/actions/workflows/check.yaml)

Apify CLI is the command-line tool for creating, developing, and deploying [Apify Actors](https://www.apify.com/actors), and for managing the Apify cloud platform from your terminal.

## Features

- Create, develop, and deploy Apify Actors from your terminal
- Run Actors locally for development and testing, or in the Apify cloud
- Manage Actors, datasets, key-value stores, and request queues
- Manage secret environment variables used by your Actors
- Works with any programming language — Actors run as Docker containers on the platform

## Agent skill

This repo ships an [agent skill](./skills/apify/SKILL.md) that teaches AI coding agents (Claude Code, Cursor, etc.) how to work with the Apify CLI reliably. You can print the skill straight from the CLI — it always matches your installed version:

```bash
apify help --skill
```

If you'd rather have the skill installed persistently, `apify help --skill` prints a valid `SKILL.md` that you can redirect into your agent's skills directory. The location depends on the agent:

### Claude Code

```bash
mkdir -p ~/.claude/skills/apify-cli
apify help --skill > ~/.claude/skills/apify-cli/SKILL.md
```

### Codex and other agents

Codex and most other agents follow the [Agent Skills open standard](https://developers.openai.com/codex/skills), which loads skills from `.agents/skills` (per repo) or `~/.agents/skills` (per user):

```bash
mkdir -p ~/.agents/skills/apify-cli
apify help --skill > ~/.agents/skills/apify-cli/SKILL.md
```

That copy is a snapshot; re-run it after upgrading the Apify CLI to refresh it.

## Quick start

1. **Install the CLI** (macOS / Linux):

   ```bash
   curl -fsSL https://apify.com/install-cli.sh | bash
   ```

   For Windows and other installation options, see [Installation](#installation).

2. **Log in** with your [Apify API token](https://console.apify.com/settings/integrations):

   ```bash
   apify login
   ```

3. **Run an Actor** on the Apify cloud:

   ```bash
   apify call apify/hello-world --output-dataset
   ```

   This runs the public [`apify/hello-world`](https://apify.com/apify/hello-world) Actor and prints its results. To build your own Actor instead, run `apify create` and follow the interactive wizard.

## Installation

### macOS / Linux (bundle, recommended)

```bash
curl -fsSL https://apify.com/install-cli.sh | bash
```

### macOS / Linux (Homebrew)

```bash
brew install apify-cli
```

### Windows

```powershell
irm https://apify.com/install-cli.ps1 | iex
```

### npm (cross-platform)

Requires [Node.js](https://nodejs.org) 22 or higher:

```bash
npm install -g apify-cli
```

You can also run the CLI without a global install via `npx apify-cli <command>`.

Verify the installation:

```bash
apify --version
```

## Commands

The table below lists the most common commands. For the full reference, see the [command reference](https://docs.apify.com/cli/docs/reference).

| Command         | Description                                               |
| --------------- | --------------------------------------------------------- |
| `apify create`  | Create a new Actor project from a template                |
| `apify init`    | Initialize an existing project as an Actor                |
| `apify run`     | Run the Actor locally                                     |
| `apify login`   | Authenticate with the Apify platform                      |
| `apify logout`  | Log out of the Apify platform                             |
| `apify push`    | Deploy the Actor to the Apify cloud                       |
| `apify pull`    | Pull an Actor from the cloud to your local machine        |
| `apify call`    | Run the Actor on the Apify cloud                          |
| `apify builds`  | Manage Actor builds (`create`, `info`, `ls`, `log`, `rm`) |
| `apify secrets` | Manage secret environment variables                       |
| `apify help`    | Show help for any command                                 |

Actor configuration lives in `.actor/actor.json`. See the [Actor configuration docs](https://docs.apify.com/platform/actors/development/actor-definition/actor-json) for the full schema (name, version, build tag, environment variables, Dockerfile, input schema, storages).

## Documentation

- [Apify CLI documentation](https://docs.apify.com/cli)
- [Command reference](https://docs.apify.com/cli/docs/reference)
- [Actor development guide](https://docs.apify.com/platform/actors/development)
- [Apify platform documentation](https://docs.apify.com/platform)

## Telemetry

Apify CLI collects anonymous usage data to help us improve the tool and the Apify platform. See [Telemetry](https://docs.apify.com/cli/docs/telemetry) for details on what is collected.

To opt out, either run:

```bash
apify telemetry disable
```

or set the `APIFY_CLI_DISABLE_TELEMETRY=1` environment variable.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, code style, test categories, and PR guidelines.

## Feedback & support

- Report bugs or request features via [GitHub Issues](https://github.com/apify/apify-cli/issues)
- Browse the [Apify Help Center](https://www.apify.com/help)
- [Contact Apify support](https://www.apify.com/contact)
- Join the community on [Discord](https://discord.gg/crawlee-apify-801163717915574323)

## License

[Apache-2.0](./LICENSE.md)
