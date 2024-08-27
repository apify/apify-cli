# Feature: Print out path to invalid `actor.json`

- As an Actor developer or user
- I want to know the path to the invalid `actor.json`
- In order to fix it
- If the file is not valid JSON

## Background:

- Given my `pwd` is a fully initialized Actor project directory
- And the `actor.json` is invalid

## Rule: Print out path to invalid `actor.json`

### Example: Invalid `actor.json` file

- When I run:
  ```
  $ apify run
  ```
- Then I can read text on stderr:
  ```
  Failed to read local config at path:
  ```
- And I can read text on stderr:
  ```
  Expected property name or '}'
  ```
- And the exit status code is `5`
