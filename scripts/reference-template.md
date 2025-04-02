---
title: Apify CLI Reference Documentation
sidebar_label: Command reference
toc_max_heading_level: 5
---

The Apify CLI provides tools for managing your Apify projects and resources from the command line. Use these commands to develop Actors locally, deploy them to Apify platform, manage storage, orchestrate runs, and handle account configuration.

This reference guide documents available commands, their options, and common usage patterns, to efficiently work with Apify platform.

### General

The general commands provide basic functionality for getting help and information about the Apify CLI.

<!-- prettier-ignore-start -->
<!-- general-commands-start -->
<!-- general-commands-end -->
<!-- prettier-ignore-end -->

### Authentication & Account Management

Use these commands to manage your Apify account authentication, access tokens, and configuration settings. These commands control how you interact with Apify platform and manage sensitive information.

<!-- prettier-ignore-start -->
<!-- auth-commands-start -->
<!-- auth-commands-end -->
<!-- prettier-ignore-end -->

### Actor Development

These commands help you develop Actors locally. Use them to create new Actor projects, initialize configurations, run Actors in development mode, and validate input schemas.

<!-- prettier-ignore-start -->
<!-- actor-dev-commands-start -->
<!-- actor-dev-commands-end -->
<!-- prettier-ignore-end -->

### Actor Management

These commands let you manage Actors on Apify platform. They provide functionality for deployment, execution, monitoring, and maintenance of your Actors in the cloud environment.

#### Basic Actor Operations

Use these commands to handle core Actor operations like creation, listing, deletion, and basic runtime management. These are the essential commands for working with Actors on Apify platform.

<!-- prettier-ignore-start -->
<!-- actor-basic-commands-start -->
<!-- actor-basic-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Deployment

These commands handle the deployment workflow of Actors to Apify platform. Use them to push local changes, pull remote Actors, and manage Actor versions and builds.

<!-- prettier-ignore-start -->
<!-- actor-deploy-commands-start -->
<!-- actor-deploy-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Builds

Use these commands to manage Actor build processes. They help you create, monitor, and maintain versioned snapshots of your Actors that can be executed on Apify platform.

<!-- prettier-ignore-start -->
<!-- actor-build-commands-start -->
<!-- actor-build-commands-end -->
<!-- prettier-ignore-end -->

#### Actor Runs

These commands control Actor execution on Apify platform. Use them to start, monitor, and manage Actor runs, including accessing logs and handling execution states.

<!-- prettier-ignore-start -->
<!-- actor-run-commands-start -->
<!-- actor-run-commands-end -->
<!-- prettier-ignore-end -->

### Storage

These commands manage data storage on Apify platform. Use them to work with datasets, key-value stores, and request queues for persistent data storage and retrieval.

#### Datasets

Use these commands to manage datasets, which provide structured storage for tabular data. They enable creation, modification, and data manipulation within datasets.

<!-- prettier-ignore-start -->
<!-- dataset-commands-start -->
<!-- dataset-commands-end -->
<!-- prettier-ignore-end -->

#### Key-Value Stores

These commands handle key-value store operations. Use them to create stores, manage key-value pairs, and handle persistent storage of arbitrary data types.

<!-- prettier-ignore-start -->
<!-- keyval-commands-start -->
<!-- keyval-commands-end -->
<!-- prettier-ignore-end -->

#### Request Queues

These commands manage request queues, which handle URL processing for web scraping and automation tasks. Use them to maintain lists of URLs with automatic retry mechanisms and state management.

<!-- prettier-ignore-start -->
<!-- reqqueue-commands-start -->
<!-- reqqueue-commands-end -->
<!-- prettier-ignore-end -->

### Tasks

These commands help you manage scheduled and configured Actor runs. Use them to create, modify, and execute predefined Actor configurations as tasks.

<!-- prettier-ignore-start -->
<!-- task-commands-start -->
<!-- task-commands-end -->
<!-- prettier-ignore-end -->
