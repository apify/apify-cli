# Apify command line client (POC)

This is beta version of Apify command client.
Use on your own risk, it can be buggy.

##

## Usage

To get started with Apify command line client, first make sure you have Node 8.x installed.
Then install Apify client with:

`npm -g install apifytech/apify-cli`

## Commands

### Global commands


`apify login` - You can authenticate your local computer with your Apify account

`apify acts init -n your-act-name` - This create directory with ready to use act

### Act commands

`apify push` - Push your ready to use act to Apify cloud

`apify build` - Build your act on Apify platform

`apify run` - Run you act on Apify platform


## Workflow

1. `apify login` - Login
2. `apify acts init -n my-first-act` - Create act boilerplate
3. `cd my-first-act`
4. `npm run run-local` - Run act on local environment
4. `apify push` - Push to Apify cloud
4. `apify build` - Build act on Apify cloud
6. `apify run` - Run act on Apify cloud
