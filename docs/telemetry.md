---
sidebar_label: Telemetry
title: Telemetry
---

Apify collects telemetry data about general usage of CLI to help us improve the product.
Participation in this program is optional, and you may opt-out if you'd not like to share any information.

## How is the data collected

All telemetry data are collected and stored securely on [Mixpanel](https://mixpanel.com/).
We do not collect any sensitive information, such as your API token, or any other personal information.

### Collected metrics

Before user connects to Apify platform, we collect anonymous information about the CLI usage.

- Usage of all commands
- Internal attribute of local environment (OS, shell, Node.js version, Python version, apify CLI version)
- For `actor create` command it collects which temple was used to create the actor (language, template name, template ID)

After user connects to Apify platform (success `apify login`), we collect the same information about the CLI usage with the ID of connected user.
You can read more about how we protect personal information in our [Privacy Policy](https://apify.com/privacy-policy).


## How to opt-out

You can disable telemetry by setting the "APIFY_CLI_DISABLE_TELEMETRY" environment variable to "1".
After setting this variable, the CLI will not send any telemetry data whether you are connected with Apify or not.
