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

```bash showLineNumbers
curl -fsSL https://apify.com/install-cli.sh | bash
```

##### Windows

```powershell showLineNumbers
irm apify.com/install-cli.ps1 | iex
```

#### Other methods

##### Homebrew

```bash showLineNumbers
brew install apify-cli
```

##### NPM

First, make sure you have [Node.js](https://nodejs.org) version 20 or higher with NPM installed on your computer:

```bash showLineNumbers
node --version
npm --version
```

Install or upgrade Apify CLI by running:

```bash showLineNumbers
npm -g install apify-cli
```

:::tip Troubleshooting

If you receive a permission error, read npm's [official guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) on installing packages globally.

:::

You can verify the installation process by running the following command:

```bash showLineNumbers
apify --version
```

which should print something like:

```bash showLineNumbers
apify-cli/<@version> <platfrom> node-v18.17.0
```

### Step 2: Create your Actor

Run the following command in your terminal. It will guide you step by step through the creation process.

```bash showLineNumbers
apify create
```

:::info Explore Actor templates

The Apify CLI will prompt you to choose a template. Browse the [full list of templates](https://apify.com/templates) to find the best fit for your Actor.

:::

### Step 3: Run your Actor

Once the Actor is initialized, you can run it:

```bash showLineNumbers
apify run
```

You'll see output similar to this in your terminal:

```bash
INFO  System info {"apifyVersion":"3.4.3","apifyClientVersion":"2.12.6","crawleeVersion":"3.13.10","osType":"Darwin","nodeVersion":"v22.17.0"}
Extracted heading { level: 'h1', text: 'Your full‑stack platform for web scraping' }
Extracted heading { level: 'h3', text: 'TikTok Scraper' }
Extracted heading { level: 'h3', text: 'Google Maps Scraper' }
Extracted heading { level: 'h3', text: 'Instagram Scraper' }
```

### Step 4: Push your Actor

Once you are ready, you can push your Actor to the Apify Console, where you can schedule runs, or make the Actor public for other developers.

#### Login to Apify Console

```bash showLineNumbers
apify login
```

:::note create an Apify account

Before you can interact with the Apify cloud, you need to [create an Apify account](https://console.apify.com/)
and log in to it using the above command. You will be prompted for
your [Apify API token](https://console.apify.com/settings/integrations).

:::

#### Push to Apify Console

```bash showLineNumbers
apify push
```

### Step 5: Call your Actor (optional)

You can run your Actor on the Apify Platform. If you want to run the Actor corresponding to the current directory on the Apify Platform, use:

```bash showLineNumbers
apify call
```

This command can also be used to run other Actors, for example:

```bash showLineNumbers
apify call apify/hello-world
```

### Next steps

- Check the [command reference](reference.md) for more information about individual commands.
- If you have a problem with the Apify CLI, check the [troubleshooting](troubleshooting.md) guide.
- Learn more about [Actors](/platform/actors).
