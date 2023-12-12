---
title: Apify CLI
---

<a href="https://www.npmjs.com/package/apify-cli"><img src="https://badge.fury.io/js/apify-cli.svg" alt="npm version" loading="lazy" /></a>
<a href="https://travis-ci.com/apify/apify-cli?branch=master"><img src="https://travis-ci.com/apify/apify-cli.svg?branch=master" loading="lazy" alt="Build Status" /></a>

Apify command-line interface (Apify CLI) helps you create, develop, build and run
[Apify actors](https://www.apify.com/actors),
and manage the Apify cloud platform from any computer.

Apify actors are cloud programs that can perform arbitrary web scraping, automation or data processing job.
They accept input, perform their job and generate output.
While you can develop actors in an online IDE directly in the [Apify web application](https://console.apify.com/),
for complex projects it is more convenient to develop actors locally on your computer
using <a href="https://github.com/apify/apify-sdk-js">Apify SDK</a>
and only push the actors to the Apify cloud during deployment.
This is where the Apify CLI comes in.

Note that actors running on the Apify platform are executed in Docker containers, so with an appropriate `Dockerfile`
you can build your actors in any programming language.
However, we recommend using JavaScript / Node.js, for which we provide most libraries and support.
