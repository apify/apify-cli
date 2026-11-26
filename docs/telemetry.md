---
title: Telemetry
description: Learn what usage data Apify CLI collects, how it's linked to your account, and how to turn off telemetry.
---

Apify CLI collects usage data to help improve the product. Telemetry is on by default, but you can opt out at any time.

## Collected data

The CLI sends your usage data to [Segment](https://segment.com/). This information includes:

- The command and flag names.
- The command's exit code and duration.
- Attributes of your local environment, such as OS, install method, runtime version, and CLI version.
- Whether the command ran in CI, in an interactive terminal, or under an AI coding agent.
- For commands that run or deploy an Actor from its directory, the Actor's language and runtime version.
- For `apify create`, the template details such as its ID, name, and language.
- For `apify login`, the login method.

The CLI never sends your API token, the contents of your files, or the inputs you pass to commands.

Before you log in, events are tied only to a random ID stored on your machine. After you log in, they also include your Apify user ID. For details on how Apify handles personal data, see the [Apify Privacy Policy](https://apify.com/privacy-policy).

## Turn off telemetry

To turn off telemetry, run:

```bash
apify telemetry disable
```

Alternatively, set the `APIFY_CLI_DISABLE_TELEMETRY` environment variable to `1`.

## Feedback

`apify feedback` sends a report to the Apify team. Unlike other commands, it sends the text you pass to it. The report includes:

- The message and any optional fields you pass, such as `--actor-id` or `--expected`.
- The CLI version, OS, and install method.
- The name of the command you ran before `apify feedback` and its exit code, without its arguments or flag values.
- Whether a human or an AI agent sent it, and which agent, if the CLI detects one.
- The same random ID and Apify user ID as other events.

The CLI sends feedback even when telemetry is turned off, because you explicitly asked it to. Don't include personal data, credentials, or secrets.

The CLI doesn't send feedback that contains an API token, a password, or another secret it recognizes. It checks for Apify tokens, for values passed to something named like a credential (such as `--token` or `password:`), and for the tokens stored on your machine. Replace the secret with a placeholder such as `<token>`, then send the feedback again.
