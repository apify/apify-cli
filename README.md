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

3. **Create, run, and deploy** your first Actor:

   ```bash
   apify create # it will walk you through an interactive wizard
   cd my-actor
   apify run
   apify push
   ```

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

### Caller identification (`--user-agent`)

If you embed the CLI in a tool, skill, or plugin, you can tag telemetry with a caller identifier so we can distinguish direct CLI usage from integrations. This is opt-in and purely informational — it does not change CLI behavior.

Pass it as a flag on any command:

```bash
apify actor call my-actor --user-agent apify-agent-skills/ultimate-scraper-1.3.0
```

Or set it via environment variable, useful when wrapping the CLI:

```bash
export APIFY_CLI_USER_AGENT=apify-agent-skills/ultimate-scraper-1.3.0
apify actor call my-actor
```

The flag value takes precedence over the environment variable. When neither is set, no caller identifier is recorded.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, code style, test categories, and PR guidelines.

## Feedback & support

- Report bugs or request features via [GitHub Issues](https://github.com/apify/apify-cli/issues)
- Browse the [Apify Help Center](https://www.apify.com/help)
- [Contact Apify support](https://www.apify.com/contact)
- Join the community on [Discord](https://discord.gg/crawlee-apify-801163717915574323)

## License

[Apache-2.0](./LICENSE.md)
