---
title: Installation
description: Learn how to install Apify CLI using installation scripts, Homebrew, or NPM.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


Learn how to install Apify CLI.

## Installation scripts

Installation scripts use [Bun](https://bun.sh/) to create a standalone executable file, so you don't need Node.js.

This approach eliminates Node.js dependency management, which is useful if you're a Python developer or work in non-Node.js environments.

<Tabs>
  <TabItem value="MacOS/Linux">
    ```bash
    curl -fsSL https://apify.com/install-cli.sh | bash
    ```
  </TabItem>
  <TabItem value="Windows">
    ```powershell
    irm https://apify.com/install-cli.ps1 | iex
    ```
  </TabItem>
</Tabs>

## Homebrew

Homebrew automatically installs Node.js as a dependency.

If you already have Node.js installed through another method, for example, `nvm`, it might create version conflicts. To fix it, modify your `PATH` environment variable to prioritize your preferred Node.js installation over Homebrew's version.

```bash
brew install apify-cli
```

## NPM

1. Make sure you have [Node.js](https://nodejs.org) version 22 or higher with NPM installed:

    ```bash
    node --version
    npm --version
    ```

1. Install or upgrade Apify CLI:

    ```bash
    npm install -g apify-cli
    ```

<br/>

:::tip Troubleshooting

If you receive a permission error, read npm's [guide on installing packages globally](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

:::

## Verify installation

To verify the installation process, run:

```bash
apify --version
```

The output includes installation details, for example:

```bash
apify-cli/1.0.1 (0dfcfd8) running on darwin-arm64 with bun-1.2.19 (emulating node 24.3.0), installed via bundle
```

## Upgrade version

To upgrade Apify CLI to the latest version, run:

```bash
apify upgrade
```

## Environment variables

By default, the CLI talks to the production Apify API (`https://api.apify.com`) and Apify Console
(`https://console.apify.com`). You can point it at a different instance — e.g. a local or staging
deployment — using the following environment variables. This is independent of the Actor-level
environment variables described in [Environment variables for Actors](./vars.md).

| Variable                      | Purpose                                                              | Default                     |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------- |
| `APIFY_API_BASE_URL`           | The Apify API base URL used by CLI commands.                        | `https://api.apify.com`     |
| `APIFY_CLIENT_BASE_URL`        | Legacy fallback for the API base URL, kept for backward compatibility. | —                            |
| `APIFY_API_PUBLIC_BASE_URL`    | The globally accessible API base URL, forwarded to the client. Independent of `APIFY_API_BASE_URL` — setting one does not change the other's default. | `https://api.apify.com` |
| `APIFY_CONSOLE_BASE_URL`       | The Apify Console base URL (origin only) used for every link the CLI prints or opens. | `https://console.apify.com` |

### API base URL precedence

An explicit command flag/option (where a command accepts one) always wins, followed by the environment
variables, followed by the built-in default:

```text
explicit flag/option > APIFY_API_BASE_URL > APIFY_CLIENT_BASE_URL > https://api.apify.com
```

`APIFY_API_PUBLIC_BASE_URL` follows the same shape (`explicit option > APIFY_API_PUBLIC_BASE_URL >
default`) but is resolved independently of `APIFY_API_BASE_URL` — the two never affect each other's
default.

### Console base URL

`APIFY_CONSOLE_BASE_URL` should be an origin only (e.g. `http://localhost:3000`), not a full URL with
a path — the CLI appends the relevant path or fragment (e.g. `/actors/<id>`, `#/builds/<n>`) itself.

### Login and localhost

When `apify login` resolves the Console base to a localhost address (e.g. because
`APIFY_CONSOLE_BASE_URL` is set to a local Console instance) and no API base is otherwise specified,
the API defaults to `http://localhost:3333` so a local Console can authenticate against a local API.
Setting `APIFY_API_BASE_URL` (or, where supported, an explicit flag) always overrides this default.
