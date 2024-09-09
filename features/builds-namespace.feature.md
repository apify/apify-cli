# Feature: Builds namespace

- As an Actor developer or user
- I want to be able to manage the builds of my actors on Apify Console
- In order to trigger new builds from the CLI, list them, and get details about them

## Background:

- Given my `pwd` is a fully initialized Actor project directory
- And the `actor.json` is valid
- And I am a logged in Apify Console User

## Rule: Creating builds works

### Example: calling create with invalid actor ID fails

- When I run:
  ```
  $ apify builds create --actor=invalid-id
  ```
- Then I can read text on stderr:
  ```
  Actor with name or ID "invalid-id" was not found
  ```

### Example: calling create from an unpublished actor directory fails

- When I run:
  ```
  $ apify builds create
  ```
- Then I can read text on stderr:
  ```
  Actor with name "{{ testActorName }}" was not found
  ```

### Example: calling create from a published actor directory works

- Given the local Actor is pushed to the Apify platform
- When I run:
  ```
  $ apify builds create
  ```
- Then I can read text on stderr:
  ```
  Build Started
  ```
- And I can read text on stderr:
  ```
  {{ testActorName}}
  ```

### Example: calling create from a published actor with `--json` prints valid JSON data

- Given the local Actor is pushed to the Apify platform
- When I run:
  ```
  $ apify builds create --json
  ```
  - Then I can read valid JSON on stdout

## Rule: Printing information about builds works

### Example: calling info with invalid build ID fails

- When I run:
  ```
  $ apify builds info invalid-id
  ```
- Then I can read text on stderr:
  ```
  Build with ID "invalid-id" was not found
  ```

### Example: calling info with valid build ID works

- Given the local Actor is pushed to the Apify platform
- When I run:
  ```
  $ apify builds create
  ```
- And I capture the build ID
- And I run with captured data:
  ```
  $ apify builds info {{ buildId }}
  ```
- Then I can read text on stderr:
  ```
  {{ testActorName }}
  ```

### Example: calling info with valid build ID and `--json` prints valid JSON data

- Given the local Actor is pushed to the Apify platform
- When I run:
  ```
  $ apify builds create
  ```
- And I capture the build ID
- And I run with captured data:
  ```
  $ apify builds info {{ buildId }} --json
  ```
- Then I can read valid JSON on stdout

## Rule: Listing builds works

<!-- TODO table testing? -->

### Example: calling list with --json prints valid JSON data

- Given the local Actor is pushed to the Apify platform
- When I run:
  ```
  $ apify builds ls --json
  ```
- Then I can read valid JSON on stdout

<!-- TODO: We should test builds log, but that's gonna be annoying, so for now leave it as is -->
