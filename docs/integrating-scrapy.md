---
title: Integrating Scrapy projects
description: Learn how to run Scrapy projects as Apify Actors and deploy them on the Apify platform.
sidebar_label: Integrating Scrapy projects
---

[Scrapy](https://scrapy.org/) is a widely used open-source web scraping framework for Python. Scrapy projects can now be executed on the Apify platform using our dedicated wrapping tool. This tool allows users to transform their Scrapy projects into [Apify Actors](https://docs.apify.com/platform/actors) with just a few simple commands.

## Getting started

### Install Apify CLI

To run the migration tool, you need to have the Apify CLI installed. You can install it using Homebrew with the following command:

```bash showLineNumbers
brew install apify-cli
```

Alternatively, you can install it using NPM with the following command:

```bash showLineNumbers
npm i -g apify-cli
```

In case of any issues, please refer to the [installation guide](./installation.md).

## Actorization of your existing Scrapy spider

Assuming your Scrapy project is set up, navigate to the project root where the `scrapy.cfg` file is located.

```bash showLineNumbers
cd your_scraper
```

Verify the directory contents to ensure the correct location.

```bash showLineNumbers
$ ls -R
.:
your_scraper  README.md  requirements.txt  scrapy.cfg

./your_scraper:
__init__.py  items.py  __main__.py  main.py  pipelines.py  settings.py  spiders

./your_scraper/spiders:
your_spider.py  __init__.py
```

To convert your Scrapy project into an Apify Actor, initiate the wrapping process by executing the following command:

```bash showLineNumbers
apify init
```

The script will prompt you with a series of questions. Upon completion, the output might resemble the following:

```bash showLineNumbers
Info: The current directory looks like a Scrapy project. Using automatic project wrapping.
? Enter the Scrapy BOT_NAME (see settings.py): books_scraper
? What folder are the Scrapy spider modules stored in? (see SPIDER_MODULES in settings.py): books_scraper.spiders
? Pick the Scrapy spider you want to wrap: BookSpider (/home/path/to/actor-scrapy-books-example/books_scraper/spiders/book.py)
Info: Downloading the latest Scrapy wrapper template...
Info: Wrapping the Scrapy project...
Success: The Scrapy project has been wrapped successfully.
```

For example, here is a [source code](https://github.com/apify/actor-scrapy-books-example) of an actorized Scrapy project, and [here](https://apify.com/vdusek/scrapy-books-example) the corresponding Actor in Apify Store.

### Run the Actor locally

Create a Python virtual environment by running:

```bash showLineNumbers
python -m virtualenv .venv
```

Activate the virtual environment:

```bash showLineNumbers
source .venv/bin/activate
```

Install Python dependencies using the provided requirements file named `requirements_apify.txt`. Ensure these requirements are installed before executing your project as an Apify Actor locally. You can put your own dependencies there as well.

```bash showLineNumbers
pip install -r requirements-apify.txt [-r requirements.txt]
```

### Run the scraper as Scrapy project

The project remains executable as a Scrapy project.

```bash showLineNumbers
scrapy crawl your_spider -o books.json
```

## Deploy on Apify

### Log in to Apify

You will need to provide your [Apify API Token](https://console.apify.com/account/integrations) to complete this action.

```bash showLineNumbers
apify login
```

### Deploy your Actor

This command will deploy and build the Actor on the Apify platform. You can find your newly created Actor under [Actors -> My Actors](https://console.apify.com/actors?tab=my).

```bash showLineNumbers
apify push
```

## What the wrapping process does

Within our [Python SDK](https://github.com/apify/apify-sdk-python/tree/master/src/apify/scrapy), specific Scrapy components are prepared. These include a custom [scheduler](https://docs.scrapy.org/en/latest/topics/scheduler.html) for interacting with the [Apify request queue](https://docs.apify.com/platform/storage/request-queue), an [item pipeline](https://docs.scrapy.org/en/latest/topics/item-pipeline.html) for pushing data to the [Apify dataset](https://docs.apify.com/platform/storage/dataset), and a custom [retry middleware](https://docs.scrapy.org/en/latest/_modules/scrapy/downloadermiddlewares/retry.html) for handling HTTP request retries. These components facilitate interaction between your Scrapy project and the Apify platform.

The initialization command enhances your project by adding necessary files and updating configurations while preserving its functionality as a typical Scrapy project. The extra requirements file, named `requirements_apify.txt`, includes the Apify Python SDK and other essential requirements.

<!-- TODO: we also add .actor/ and update .dockerignore, .gitignore and scrapy.cfg -->

## Additional links

- [Scrapy Books Example Actor](https://apify.com/vdusek/scrapy-books-example)
- [Python Actor Scrapy template](https://apify.com/templates/python-scrapy)
- [Apify SDK for Python](https://docs.apify.com/sdk/python)
- [Apify platform](https://docs.apify.com/platform)
- [Join our developer community on Discord](https://discord.com/invite/jyEM2PRvMU)

> We welcome any feedback! Please feel free to contact us at [python@apify.com](mailto:python@apify.com). Thank you for your valuable input.
>
