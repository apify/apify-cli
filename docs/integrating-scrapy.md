---
sidebar_label: Integrating Scrapy projects
title: Integrating Scrapy projects
---

[Scrapy](https://scrapy.org/), a widely used open-source web scraping framework for Python, can now be migrated to the Apify platform using our dedicated migration tool. This tool allows users to transform their Scrapy projects into [Apify Actors](https://docs.apify.com/platform/actors) with just a few simple commands.

:::note

To run the Apify CLI, you will need to have [Node.js](https://nodejs.org/en/) version 16 or higher installed. To check your Node.js version, run the following command in your terminal.

```bash
node -v
```
:::

To transform your Scrapy spiders into Apify Actors, execute the following commands in the root of your Scrapy project. The command will automatically detect the presence of the `scrapy.cfg` file in your project.

```bash
# Create Apify Actor from your Scrapy spider
cd your-scrapy-project
npx apify init

# Deploy your Scrapy Actor to Apify
npx apify login
npx apify push
```

Within our [Python SDK](https://github.com/apify/apify-sdk-python/tree/master/src/apify/scrapy), we have prepared a few Scrapy components, including a custom [scheduler](https://docs.scrapy.org/en/latest/topics/scheduler.html) for interaction with the [Apify request queue](https://docs.apify.com/platform/storage/request-queue), [item pipeline](https://docs.scrapy.org/en/latest/topics/item-pipeline.html) for pushing data to the [Apify dataset](https://docs.apify.com/platform/storage/dataset), and custom [retry middleware](https://docs.scrapy.org/en/latest/_modules/scrapy/downloadermiddlewares/retry.html). These components ensure a seamless interaction between your Scrapy project and the Apify platform. The initialization command augments your project by adding necessary files and updating configurations while maintaining its functionality as a regular Scrapy project.

```
scrapy crawl spider_name
```

We supply an extra requirements file named `requirements_apify.txt`. Prior to executing your project as an Apify Actor, ensure that you install these requirements.

```
pip install -r requirements_apify.txt
```

Your project is now ready to be run as an Apify Actor. Use the following command to run it locally.

```
apify run
```

You can also build and push the Actor to the Apify platform and execute it there.

```
apify push
```

> We welcome any feedback! Please feel free to contact us at [python@apify.com](mailto:python@apify.com). Thank you for your valuable input.
