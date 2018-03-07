# Apify command line client (POC)

This is beta version of Apify command client.
Use on your own risk, it can be buggy.

##

## Usage

To get started with Apify command line client, first make sure you have Node 8.x installed.
Then install Apify client with:

`npm -g install Apifier/apify-cli`

## Commands

### Global commands


`apify login` - You can authenticate your local computer with your Apify account

`apify create act_name [--template template_name]` - This create directory with ready to use act

### Act commands

`apify push` - Push and build your ready to use act to Apify cloud

## Workflow

1. `apify login` - Login
2. `apify create my-first-act` - Create act boilerplate
3. `cd my-first-act`
4. `apify push` - Push to Apify cloud
