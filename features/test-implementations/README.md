# Cucumber Structure

Welcome to the land of code definitions for the cucumber syntax we support for writing human-readable test cases for Apify CLI!

Throughout this document, you will encounter several specific keywords:

- world: an object that stores results and certain configurations and that gets passed around per test case

This folder is (at the time of writing) split into several distinct parts:

## World (`0.world.ts`)

This file's sole purpose is to try to define the world object that gets passed around. This file can change as more test cases are added, and it is recommended to keep it up to date with the latest test cases.

This file also includes methods that are shared across all layers of the test case (setup, execution, results).

## Test Actor (`0.test-actor.js`)

Contains the basic source code actors run in the tests. If this file requires more specific logic, newer versions can be created and referenced in the [Setup](#setup-1setupts) file.

## Setup (`1.setup.ts`)

This file is intended to setup the world: gather any arguments, prepare an actor to test, setup the input, prepare the stdin input, etc. This is where you configure all `Given` steps.

Currently, the following phrases are implemented:

- ``given my `pwd` is a fully initialized actor project directory``
- ``given the `actor.json` is valid``
- ``given the `actor.json` is invalid``
- `given the actor implementation doesn't throw itself`
- `given the following input provided via standard input`
  - Example:
  ```
  Given the following input provided via standard input
  """
  {"foo":"bar"}
  """
  ```
  - This step supports providing input to the CLI via stdin. This is useful for testing CLI commands that can optionally accept standard input.
- `given the following input provided via file \`<filename>\``
  - Example:
  ```
  Given the following input provided via file `input.json`
  """
  {"foo":"bar"}
  """
  ```
  - This step supports providing input to the CLI via a file.

Certain phrases may require a specific order to be executed in. Errors will be thrown accordingly if the order is not followed.

## Execution (`2.execution.ts`)

This file is intended to execute everything that is passed in the `When` steps. This is where you run the actor, run the actor with certain flags, etc. You rely on the information stored in the world to decide what extra data to pass to the CLI.

Currently, the following phrases are implemented:

- `when I run:` followed by a code block consisting of a CLI command (optionally prefixed with `$`)
  - Example:
  ```
  When I run:
  `​`​`
  $ apify actor run --input='{"foo":"bar"}'
  `​`​`
  ```
  - This step supports running only CLI commands. It also expects only **one** command to be ran. Any more than one command will result in an error (this is done for simplicity sake)
  - When referring to the CLI, you should mention the `apify` binary (as if you'd write this in a terminal). For testing sake, when we actually run the command, it will instead call the `tsx ./bin/dev.js` script, meaning changes that you do to the CLI will be reflected in the tests without needing a rebuild.

## Results (`3.results.ts`)

This file is intended to check the results of the execution. This is where you check the output of the CLI, the exit code, the output of the actor, etc. You rely on the information stored in the world to decide what to check.

Currently, the following phrases are implemented:

- `then the local run has an input JSON:` followed by a code block consisting of a JSON object
  - Example:
  ```
  Then the local run has an input JSON:
  `​`​`
  {"foo":"bar"}
  `​`​`
  ```
  - This step checks the input of the actor run. It expects the input to be a JSON object. If the input is not a JSON object, an error will be thrown. This will ensure the overridden input is correctly passed to the actor run.
- `then the local actor run has started`
  - This step checks if the actor run has actually started.
- `then the local actor run hasn't even started`
  - This step checks if the actor run hasn't started. If the actor run has started, an error will be thrown.
- ``then the exit status code is `<number>`​``
  - Example:
  ```
  Then the exit status code is `0`
  ```
  - This step checks the exit status code of the CLI. If the exit status code is not the same as the one provided, an error will be thrown.
- ``then the exit status code is not `<number>`​``
  - Example:
  ```
  Then the exit status code is not `0`
  ```
  - This step checks the exit status code of the CLI. If the exit status code is the same as the one provided, an error will be thrown.
- `then I don't see any Node.js exception`
  - This step checks if there are any Node.js exceptions in the output. If there are any, an error will be thrown.
- `then I can read text on stderr:` followed by a code block consisting of a string
  - Example:
  ```
  Then I can read text on stderr:
  `​`​`
  use "--input-file=" flag instead
  `​`​`
  ```
  - This step checks if the text provided is in the stderr output. If the text is not in the stderr output, an error will be thrown.
