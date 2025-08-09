---
title: Quick Start
description: Learn how to install Apify CLI, and how to create, run, and manage Actors through it.
sidebar_label: Quick Start
---

Learn how to install Apify CLI, and how to create, run, and manage Actors through it.

### Step 1: Installation

You can install Apify CLI either using installation scripts:

#### Preferred methods

##### MacOS / Unix

```bash
curl -fsSL https://apify.com/install-cli.sh | bash
```

##### Windows

```powershell
irm apify.com/install-cli.ps1 | iex
```

#### Other methods

##### Homebrew

```bash
brew install apify-cli
```

##### NPM

First, make sure you have [Node.js](https://nodejs.org) version 20 or higher with NPM installed on your computer:

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

You can verify the installation process by running the following command:

```bash
apify --version
```

which should print something like:

```bash
apify-cli/1.0.1 (0dfcfd8) running on darwin-arm64 with bun-1.2.19 (emulating node 24.3.0), installed via bundle
```

### Step 2: Create your Actor

Run the following command in your terminal. It will guide you step by step through the creation process.

```bash
apify create
```

:::info Explore Actor templates

The Apify CLI will prompt you to choose a template. Browse the [full list of templates](https://apify.com/templates) to find the best fit for your Actor.

:::

### Step 3: Run your Actor

Once the Actor is initialized, you can run it:

```bash
apify run
```

You'll see output similar to this in your terminal:

```bash showLineNumbers
INFO  System info {"apifyVersion":"3.4.3","apifyClientVersion":"2.12.6","crawleeVersion":"3.13.10","osType":"Darwin","nodeVersion":"v22.17.0"}
Extracted heading { level: 'h1', text: 'Your full‑stack platform for web scraping' }
Extracted heading { level: 'h3', text: 'TikTok Scraper' }
Extracted heading { level: 'h3', text: 'Google Maps Scraper' }
Extracted heading { level: 'h3', text: 'Instagram Scraper' }
```

### Step 4: Push your Actor

Once you are ready, you can push your Actor to the Apify Console, where you can schedule runs, or make the Actor public for other developers.

#### Login to Apify Console

```bash
apify login
```

:::note create an Apify account

Before you can interact with the Apify Console, [create an Apify account](https://console.apify.com/).
When you run `apify login`, you can choose one of the following methods:

- Sign in via the Apify Console in your browser — recommended.
- Provide an [Apify API token](https://console.apify.com/settings/integrations) — alternative method.

The interactive prompt will guide you through either option.

:::

#### Push to Apify Console

```bash
apify push
```

### Step 5: Call your Actor (optional)

You can run your Actor on the Apify Console. In the following example, the command runs `apify/hello-world` on the Apify Console.

```bash
apify call apify/hello-world
```

### Next steps

- Check the [command reference](./reference.md) for more information about individual commands.
- If you have a problem with the Apify CLI, check the [troubleshooting](./troubleshooting.md) guide.
- Learn more about [Actors](/platform/actors).
