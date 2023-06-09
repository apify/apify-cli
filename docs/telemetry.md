---
sidebar_label: Telemetry
title: Telemetry
---

Apify collects telemetry data about general usage of CLI to help us improve the product.
Participation in this program is optional, and you may opt-out if you'd not like to share any information.

## How is the data collected

We currently collect the following metrics:

- Usage of all commands without any arguments or flags values
- Templates used for `actor create` command
- After successful login with Apify account using `apify login`, we collect the Apify user's ID

All telemetry data are collected and stored securely on [Mixpanel](https://mixpanel.com/).

## How to opt-out

To opt out of telemetry, set the `APIFY_CLI_DISABLE_TELEMETRY` environment variable to true.
