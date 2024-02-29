# Contributing to apify-cli

## Tests

Tests are implemented using the [Vitest](https://vitest.dev/) framework.
You need to have Apify account to test all apify-cli features.

Then you can run tests with commands in repository root directory:

1. Install all dependencies:
   `npm install`

2. Run tests using credentials of the 'apify-test' user:
   `TEST_USER_TOKEN=<apifyUserApiToken> npm run test`

## Publish new version

Only users with access to [apify-cli package](https://www.npmjs.com/package/apify-cli) can publish new version.

Release of new versions is managed by GitHub Actions. On pushes to the master branch, prerelease versions are automatically produced. Latest releases are triggered manually through the GitHub release tool. After creating a release there, Actions will automatically produce the latest version of the package.

1. Manually increment version in `package.json`

2. GitHub Actions build is triggered by a push to `master` (typically a merge of a PR).

3. To trigger the latest release, go to the GitHub release tool (select `releases` under `<> Code`). There, draft a new release, fill the form and hit `Publish release`. Actions will automatically release the latest version of the package.

## Writing tests

In `test/__setup__/hooks` we have a collection of hooks that you can use while writing tests to set up the testing environment to be usable when running tests in parallel (especially useful for tests that require authenticating into an Apify account).

### `useAuthSetup`

Use this hook at the start of your test file to mark the entire suite as require-ing a separated authentication setup. By default, this will recreate the authentication setup per test in your suite, but you can disable that by passing in `{ perTest: false }` in the call to `useAuthSetup`.`

#### Example usage

```typescript
import { useAuthSetup } from "./__setup__/hooks";

useAuthSetup();
// Alternatively, if this suite requires the authentication to persist across all tests
useAuthSetup({ perTest: false });
```

### `useTempPath`

This hook should always be used when working with commands that alter the file system. This hook:

-   creates your temporary directory with the name you provided
-   provides calls for before and after all tests to setup and clean up the temporary directory
-   supports mocking the process cwd to the temporary directory so you can run commands and test their behavior.

**Important note about the cwd mocking**: when you use this hook and tell it to mock the cwd, you need to ensure these following things **always** happen:

-   You import `process` from `node:process` in your command or file you want to test with the mocked cwd. You do not use `globalThis.process` at all!
-   You import the files that may rely on the mocked cwd AFTER you call `useTempPath` in your test file, by using `await import()` instead of `import x from '..';`

It also comes with several options:

-   `create`: defaulted to `true`, it decides if the temporary directory should be created or not in the beforeAll hook.
-   `remove`: defaulted to `true`, it decides if the temporary directory should be removed or not in the afterAll hook.
-   `cwd`: defaulted to `false`, it decides if the process.cwd should be mocked to the temporary directory or not.
-   `cwdParent`: defaulted to `false`, it decides whether the initial value of the mocked process.cwd will point to the parent directory of the temporary directory or the actual temporary directory.

This hook also returns several values in an object:

-   `tmpPath`: the full path to the temporary directory that was requested
-   `joinPath`: a utility function similar to `path.join` that lets you work with paths in the temporary directory
-   `beforeAllCalls`: a function you should manually call in your `beforeAll` hook to set up the temporary directory as well as the used cwd mock
-   `afterAllCalls`: a function you should manually call in your `afterAll` hook to clean up the temporary directory
-   `toggleCwdBetweenFullAndParentPath`: a function you can call to toggle the cwd mock between the full path to the temporary directory and the parent directory of the temporary directory

#### Example usage (creates an actor, then pushes it, then calls it)

> This example assumes you've also handled logging in.

```typescript
import { useTempPath } from "./__setup__/hooks";
import { writeFile } from "node:fs/promises";

const ACTOR_NAME = "owo";

const {
    beforeAllCalls,
    afterAllCalls,
    joinPath,
    toggleCwdBetweenFullAndParentPath,
} = useTempPath(ACTOR_NAME, {
    cwd: true,
    cwdParent: true,
    create: true,
    remove: true,
});

const { CreateCommand } = await import("../../src/commands/create.js");
const { PushCommand } = await import("../../src/commands/push.js");
const { CallCommand } = await import("../../src/commands/call.js");

beforeAll(async () => {
    await beforeAllCalls();

    await CreateCommand.run(
        [
            ACTOR_NAME,
            "--template",
            "project_empty",
            "--skip-dependency-install",
        ],
        import.meta.url
    );

    const code = `
import { Actor } from 'apify';

Actor.main(async () => {
    await Actor.setValue('OUTPUT', 'Hello world!');
    console.log('Done!');
});`;

    await writeFile(joinPath("main.js"), code);

    toggleCwdBetweenFullAndParentPath();

    await PushCommand.run(["--no-prompt"], import.meta.url);
});

afterAll(async () => {
    await afterAllCalls();
});
```

### Running commands

Running commands in tests can be done in two ways:

-   Importing the command class and calling `Command.run([], import.meta.url);`, where the array is the argv of the commands (think of it like the arguments you'd pass to the command in the terminal).
-   By importing `test` from `@oclif/test` and using that helper to run the command.
