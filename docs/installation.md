---
title: Installation
description: Learn how to install Apify CLI using installation scripts, Homebrew, or NPM.
---

Learn how to install Apify CLI using installation scripts, Homebrew, or NPM.

---

The recommended way to install Apify CLI is by using our installation scripts. This means you don't need to install Node.js to use the CLI, which is useful for Python users or anyone who doesn't want to manage Node.js dependencies.

## Preferred methods

### MacOS / Unix

```bash
curl -fsSL https://apify.com/install-cli.sh | bash
```

### Windows

```powershell
irm https://apify.com/install-cli.ps1 | iex
```

## Other methods

### Homebrew

```bash
brew install apify-cli
```

### NPM

First, make sure you have [Node.js](https://nodejs.org) version 22 or higher with NPM installed on your computer:

```bash showLineNumbers
node --version
npm --version
```

Install or upgrade Apify CLI by running:

```bash
npm install -g apify-cli
```

:::tip Troubleshooting

If you receive a permission error, read npm's [official guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) on installing packages globally.

:::

## Verify installation

You can verify the installation process by running the following command:

```bash
apify --version
```

The output should resemble the following (exact details like version or platform may vary):

```bash
apify-cli/1.0.1 (0dfcfd8) running on darwin-arm64 with bun-1.2.19 (emulating node 24.3.0), installed via bundle
```
