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

Finally execute the Apify Actor.

```bash showLineNumbers
apify run [--purge]
```

If [ActorDatasetPushPipeline](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/pipelines.py) is configured, the output of the Actor should be located on the location `storage/datasets/default/`.

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

The initialization command enhances your project by adding necessary files and updating some of them while preserving its functionality as a typical Scrapy project. The additional requirements file, named `requirements_apify.txt`, includes the Apify Python SDK and other essential requirements. The `.actor/` directory contains basic configuration of your Actor. We provide two new Python files [main.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/main.py) and [__main__.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/__main__.py), where we encapsulate the Scrapy project within an Actor. We also import and use there a few Scrapy components from our [Python SDK](https://github.com/apify/apify-sdk-python/tree/master/src/apify/scrapy). These components facilitate the integration of the Scrapy projects with the Apify platform. Further details about these components are provided in the following subsections.

### Scheduler

The [scheduler](https://docs.scrapy.org/en/latest/topics/scheduler.html) is a core component of Scrapy responsible for receiving and providing requests to be processed. To leverage the [Apify request queue](https://docs.apify.com/platform/storage/request-queue) for storing requests, a custom scheduler becomes necessary. Fortunately, Scrapy is a modular framework, allowing the creation of custom components. As a result, we have implemented the [ApifyScheduler](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/scheduler.py). When using the Apify CLI wrapping tool, the scheduler is configured in the [src/main.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/main.py) file of your Actor.

### Dataset push pipeline

[Item pipelines](https://docs.scrapy.org/en/latest/topics/item-pipeline.html) are used for the processing of the results produced by your spiders. To handle the transmission of result data to the [Apify dataset](https://docs.apify.com/platform/storage/dataset), we have implemented the [ActorDatasetPushPipeline](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/pipelines.py). When using the Apify CLI wrapping tool, the pipeline is configured in the [src/main.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/main.py) file of your Actor. It is assigned the highest integer value (1000), ensuring its execution as the final step in the pipeline sequence.

### Retry middleware

[Downloader middlewares](https://docs.scrapy.org/en/latest/topics/downloader-middleware.html) are a way how to hook into Scrapy's request/response processing. Scrapy comes with various default middlewares, including the [RetryMiddleware](https://docs.scrapy.org/en/latest/topics/downloader-middleware.html#module-scrapy.downloadermiddlewares.retry), designed to handle retries for requests that may have failed due to temporary issues. When integrating with the [Apify request queue](https://docs.apify.com/platform/storage/request-queue), it becomes necessary to enhance this middleware to facilitate communication with the request queue marking the requests either as handled or ready for a retry. When using the Apify CLI wrapping tool, the default `RetryMiddleware` is disabled, and [ApifyRetryMiddleware](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/middlewares/apify_retry.py) takes its place. Configuration for the middlewares is established in the [src/main.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/main.py) file of your Actor.

### HTTP proxy middleware

Another default Scrapy [downloader middleware](https://docs.scrapy.org/en/latest/topics/downloader-middleware.html) that requires replacement is [HttpProxyMiddleware](https://docs.scrapy.org/en/latest/topics/downloader-middleware.html#module-scrapy.downloadermiddlewares.httpproxy). To utilize the use of proxies managed through the Apify [ProxyConfiguration](https://github.com/apify/apify-sdk-python/blob/master/src/apify/proxy_configuration.py), we provide [ApifyHttpProxyMiddleware](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/middlewares/apify_proxy.py). When using the Apify CLI wrapping tool, the default `HttpProxyMiddleware` is disabled, and [ApifyHttpProxyMiddleware](https://github.com/apify/apify-sdk-python/blob/master/src/apify/scrapy/middlewares/apify_proxy.py) takes its place. Additionally, inspect the [.actor/input_schema.json](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/.actor/input_schema.json) file, where proxy configuration is specified as an input property for your Actor. The processing of this input is carried out together with the middleware configuration in [src/main.py](https://github.com/apify/actor-templates/blob/master/templates/python-scrapy/src/main.py).

## Additional links

- [Actor Scrapy Books Example](https://apify.com/vdusek/actor-scrapy-books-example)
- [Python Actor Scrapy template](https://apify.com/templates/python-scrapy)
- [Apify SDK for Python](https://docs.apify.com/sdk/python)
- [Apify platform](https://docs.apify.com/platform)
- [Join our developer community on Discord](https://discord.com/invite/jyEM2PRvMU)

> We welcome any feedback! Please feel free to contact us at [python@apify.com](mailto:python@apify.com). Thank you for your valuable input.
>
