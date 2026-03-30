---
sidebar_label: Telemetry
title: Telemetry
---

Apify collects telemetry data about the general usage of the CLI to help us improve the product. Participation in this program is optional and you may opt out if you prefer not to share any information.

## Data Collection

All telemetry data is collected and stored securely on [Mixpanel](https://mixpanel.com/). We do not collect any sensitive information such as your API token or personal information.

### Metrics Collected

Before a user connects to the Apify platform, we collect anonymous information about CLI usage including:

- Usage of all commands
- Internal attributes of the local environment (OS, shell, Node.js version, Python version, Apify CLI version)
- For the `actor create` command, we identify which template was used to create the Actor (language, template name, template ID)

After a user connects to the Apify platform (successful `apify login`), we collect the same information about CLI usage along with the ID of the connected user. You can read more about how we protect personal information in our [Privacy Policy](https://apify.com/privacy-policy).

## How to opt out

You can disable telemetry by setting the "APIFY_CLI_DISABLE_TELEMETRY" environment variable to "1". After setting this variable, the CLI will not send any telemetry data whether you are connected with Apify or not.
