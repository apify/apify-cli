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
