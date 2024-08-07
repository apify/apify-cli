# Feature: Actor Run Input

- As an Actor developer
- I want to pass input to the locally developer Actor
- In order to test different scenario
- And set and verify my assertions on the Actor behavior

## Background:

- Given my `pwd` is a fully initialized Actor project directory
- And the `actor.json` is valid
- And the Actor implementation doesn't throw itself

## Rule: The `run` command `--input` flag accepts -in-line JSON

### Example: pass JSON string to `--input` flag

- When I run:
  ```
  $ apify actor run --input='{"foo":"bar"}'
  ```
- Then the local Run has input JSON:
  ```
  {"foo":"bar"}
  ```
- And the local Actor Run has started
- And the exit status code is `0`

### Example: `--input` suggests `--input-file` flag on filename input

- When I run:
  ```
  $ apify actor run  --input=./my-path/file.json
  ```
- Then I don't see any Node.js exception
- And the local Actor Run hasn't even started
- And I can read text on stderr : "use `--input-file=` flag instead"
- And the exit status code is not `0`

### Example: `--input` has a short alias `-i`

- When I run:
  ```
  $ apify actor run -i='{"foo":"bar"}'
  ```
- And the local Actor Run has started
- Then the local Run has an input with JSON:
  ```
  {"foo":"bar"}
  ```

## Rule: The `--input-file` accepts JSON from a file

### Example: Existing, valid file input

- When I run:
  ```
  $ jo foo=bar > my-file.json
  $ apify actor run --input-file=my-file.json
  ```
- Then the local Run has an input with JSON:
  ```
  {"foo":"bar"}
  ```
- And the local Actor has started
- And the exit status code is `0`

### Example: The input file doesn't exist

- When I run:

  ```
  $ apify actor run --input-file=the-file-that-doesnt-exist.json
  ```

- Then I don't see any Node.js exception
- And the local run hasn't even started
- And I can read text on stderr: "file dosn't exist"
- And the exit status code is not `0`

## Rule: The `run` command accepts JSON stdin input

### Example: `--input-file` accepts JSON on stdin with a `-` shorthand

- When I run:
  ```
  $ jo foo=bar | apify actor run --input-file=-
  ```
- Then the local Run has an input with JSON:
  ```
  {"foo":"bar"}
  ```
- And the Actor has started
- And the exit status code is `0`

### Example: `run` command accepts JSON on stdin an assumed alias for `--input-file=-`

- When I run:
  ```
  $ jo foo=bar | apify actor run'
  ```
- Then the local Run has an input with JSON:
  ```
  {"foo":"bar"}
  ```
- And the Actor has started
- And the exit status code is `0`

### Rule: Bonus to demo OCLIF mambojumbo, this Rule possible to remove

### Example: `--input` flag doesn't accept `-` as a stdin shorthand

- When I run:
  ```
  $ echo '{"foo":"bar"}' | apify actor run --input=-
  ```
- Then I don't see any Node.js exception
- And there's no additional input for the Run
- And the local Actor Run hasn't even started
- And I can read text on stderr : "use `--input-file=-` flag instead"
- And the exit status code is not `0`
