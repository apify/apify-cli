---
title: Overview
---

Apify command-line interface (Apify CLI) helps you create, develop, build and run
[Apify Actors](https://apify.com/actors),
and manage the Apify cloud platform from any computer.

Apify Actors are cloud programs that can perform arbitrary web scraping, automation or data processing job.
They accept input, perform their job and generate output.
While you can develop Actors in an online IDE directly in the [Apify web application](https://console.apify.com/),
for complex projects it is more convenient to develop Actors locally on your computer
using <a href="https://github.com/apify/apify-sdk-js">Apify SDK</a>
and only push the Actors to the Apify cloud during deployment.
This is where the Apify CLI comes in.

:::note

Actors running on the Apify platform are executed in Docker containers, so with an appropriate `Dockerfile`
you can build your Actors in any programming language.
However, we recommend using JavaScript/Node.js and Python, for which we provide most libraries and support.

:::
