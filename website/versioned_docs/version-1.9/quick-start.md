---
title: Quick start
description: Learn how to create, run, and deploy Actors using Apify CLI.
---

Learn how to create, run, and deploy [Actors](https://docs.apify.com/actors) using Apify CLI.

## Before you start

- [Install Apify CLI](./installation.md).
- [Create an Apify account](https://console.apify.com/sign-up).

## 1. Create an Actor

To create an Actor, run the following command in your terminal:

```bash
apify create
```

The CLI then asks you for the following:

1. Name your Actor. Use lowercase letters, numbers, and hyphens.
1. Select a type of Actor to create:  web scraper, AI agent, API and data pipeline, or browser automation. Let's choose **web scraper**.
1. Choose the programming language: JavaScript, TypeScript, or Python. Let's choose **JavaScript**.
1. Based on your choice, the CLI suggests Actor templates. For this tutorial, let's choose **Crawlee and Cheerio**.

:::tip Explore Actor templates

To find a template that best suits your needs, browse the [full list of templates](https://apify.com/templates).

:::

The CLI creates a new directory with the boilerplate code and installs all project dependencies.

## 2. Run your Actor

When you run the code locally, the results of the Actor run are saved to your disk.

1. Navigate to the Actor directory:

    ```bash
    cd your-actor-name
    ```

1. Run your Actor:

    ```bash
    apify run
    ```

### View the results

Local runs store their data in the `storage` directory:

| Path | Contents |
| --- | --- |
| `storage/datasets/default/` | Results the Actor added to its default dataset. One JSON file per item. |
| `storage/key_value_stores/default/` | Records the Actor read or wrote, including its input. |
| `storage/request_queues/default/` | Requests the Actor enqueued. |


## 3. Deploy your Actor

By deploying your Actor to the Apify platform, you can run your code on Apify's infrastructure, schedule runs, and monitor logs and stored data.

### Log in to Apify Console

To log in, run:

```bash
apify login
```

You can then choose one of the following methods:

- _(Recommended)_ Sign in through the Apify Console in your browser.
- Provide an [Apify API token](https://console.apify.com/settings/integrations).

### Push your Actor to Apify

To upload your Actor's source code and build it on the Apify platform, run:

```bash
apify push
```

The CLI creates the Actor in your account, shows the build log, and prints a link to your Actor in Apify Console when the build succeeds.

## Next steps

- For a full list of available commands, see the [command reference](./reference.md).
- For details on how to automate the development process, see [Continuous integration](https://docs.apify.com/actors/development/deployment/continuous-integration).
- Once your first Actor is ready, [publish it on Apify Store](https://docs.apify.com/actors/publishing) and set up monetization to start earning.
