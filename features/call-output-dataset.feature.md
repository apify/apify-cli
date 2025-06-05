# Feature: Call Platfrom Actor and output default dataset

- As a user of a Platform Actor
- I want run a Platfotm Actor and wait for its results
- In order to integrate it with other unix-like CLI tools

## Background:

- Given I'm logged in to Apify as a regular user
- And there's `netmilk/actor-echo` actor available in the store
- And the Actor implementation doesn't throw itself

## Rule: I can run Actor and output its dataset in one command

### Example: Using the `actor call` with the `--output-dataset` flag

- When I run:
  ```
  $ apify call netmilk/actor-echo --input='{"input":{"foo":"bar"}}' --output-dataset
  ```
- Then the stdout output contains JSON:
  ```
  [{"foo": "bar"}]
  ```
- And the exit status code is `0`
