---
title: Quick Start
description: Learn how to create, run, and manage Actors using Apify CLI.
---

Learn how to create, run, and manage Actors using Apify CLI.

## Prerequisites

Before you begin, make sure you have the Apify CLI installed on your system. If you haven't installed it yet, follow the [installation guide](./installation.md).

## Step 1: Create your Actor

Run the following command in your terminal. It will guide you step by step through the creation process.

```bash
apify create
```

:::info Explore Actor templates

The Apify CLI will prompt you to choose a template. Browse the [full list of templates](https://apify.com/templates) to find the best fit for your Actor.

:::

## Step 2: Run your Actor

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

## Step 3: Push your Actor

Once you are ready, you can push your Actor to the Apify platform, where you can schedule runs, or make the Actor public for other developers.

#### Login to Apify Console

```bash
apify login
```

:::note Create an Apify account

Before you can interact with the Apify Console, [create an Apify account](https://console.apify.com/).
When you run `apify login`, you can choose one of the following methods:

- Sign in via the Apify Console in your browser — recommended.
- Provide an [Apify API token](https://console.apify.com/settings/integrations) — alternative method.

The interactive prompt will guide you through either option.

:::

### Push to Apify Console

```bash
apify push
```

## Step 4: Call your Actor (optional)

You can run your Actor on the Apify platform. In the following example, the command runs `apify/hello-world` on the Apify platform.

```bash
apify call apify/hello-world
```

## Next steps

- Check the [command reference](./reference.md) for more information about individual commands.
- If you have a problem with the Apify CLI, check the [troubleshooting](./troubleshooting.md) guide.
- Learn more about [Actors](https://docs.apify.com/platform/actors).
