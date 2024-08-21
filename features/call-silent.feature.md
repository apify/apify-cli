# Feature: Call Platfrom Actor

- As a CLI user of a Platform Actor
- I don't want the stdout to be pulluted with the Actor's logs
- In order to integrate it with other unix-like CLI tools

## Background:

- Given I'm logged in to Apify as a regular user
- And there's `netmilk/actor-echo` actor available in the store
- And the Actor implementation doesn't throw itself

## Rule: I can supress the Actor's log

### Example: Using the `actor call` with the `--silent` flag

- When I run:
  ```
  $ apify call netmilk/actor-echo --silent --input='{"foo":"bar"}'
  ```
- Then the the stdout is empty
- And the exit status code is `0`
