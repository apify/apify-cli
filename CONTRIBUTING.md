# Contributing to Apify CLI

Thanks for your interest in contributing! This guide covers local setup, code style, tests, and the PR process. For a high-level tour of the repo aimed at AI coding assistants, see [CLAUDE.md](./CLAUDE.md).

## Prerequisites

- **Node.js** 22 or higher
- **Yarn 4** (enabled via Corepack — do not install Yarn globally with npm)
- **Bun** ≥ 1.2.5 (optional; only needed if you want to build the standalone bundles locally)
- An [Apify account](https://console.apify.com/) and an API token if you want to run the API test suite

Enable Corepack once per machine:

```bash
corepack enable
```

## Local setup

```bash
git clone https://github.com/apify/apify-cli.git
cd apify-cli
yarn
yarn build
```

Run the CLI straight from source in dev mode (no global install required):

```bash
yarn dev:apify --version
yarn dev:apify create my-actor
```

`yarn dev:actor` does the same for the in-Actor `actor` binary.

## Code style

The repo uses three tools, wired together via a pre-commit hook (`husky` + `lint-staged`):

- **Biome** — formats JavaScript / TypeScript. Config: `biome.json`.
- **ESLint** — lints JavaScript / TypeScript using `@apify/eslint-config`. Config: `eslint.config.mjs`.
- **Prettier** — formats Markdown and YAML. Config: inherited defaults.

Run checks manually:

```bash
yarn lint        # ESLint
yarn format      # Biome + Prettier (check only)
yarn lint:fix    # Auto-fix ESLint issues
yarn format:fix  # Auto-format with Biome + Prettier
```

The pre-commit hook runs these on staged files automatically. Do not bypass it with `--no-verify` — if a hook fails, fix the underlying issue and create a new commit.

## Before opening a PR

Run the full local gauntlet before pushing:

1. `yarn lint`
2. `yarn format`
3. `yarn build`
4. `yarn test:local` (and `yarn test:api` if relevant — see below)

If you added, removed, or changed a command's signature, regenerate the reference docs:

```bash
yarn update-docs
```

Commit the updated `docs/` output alongside your change.

## Tests

Tests use [Vitest](https://vitest.dev/). They fall into four categories:

| Script               | What it runs                                                             | When to run                                        |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `yarn test:local`    | Everything except tests named `[api]` and everything outside `test/api/` | Always, on every change                            |
| `yarn test:api`      | Only tests tagged `[api]` — hits the real Apify API                      | When you touch API-facing code                     |
| `yarn test:python`   | Tests tagged `[python]` — exercises Python Actor templates               | When you touch Python template / integration code  |
| `yarn test:cucumber` | Cucumber features in `features/`                                         | When you touch anything covered by a `.feature.md` |
| `yarn test:all`      | `test:local` then `test:api`                                             | Full pre-release check                             |

API tests need a token:

```bash
TEST_USER_TOKEN=<your-apify-token> yarn test:api
```

Use a dedicated test account — API tests create and destroy Actors, datasets, and other resources.

## Writing tests

Shared helpers live in `test/__setup__/hooks/`. Two of them show up in most new tests:

### `useAuthSetup`

Isolates Apify authentication state per suite (or per test). Use it in any file that logs in, pushes, pulls, or otherwise touches `~/.apify`. By default it recreates the auth setup per test; pass `{ perTest: false }` to share one setup across the suite.

```typescript
import { useAuthSetup } from "./__setup__/hooks";

useAuthSetup();
// or: useAuthSetup({ perTest: false });
```

API-dependent test cases must have `[api]` in the test name and live in `test/api/`. Files outside `test/api/` may mix local and `[api]` tests — the `test:local` script skips the `[api]` ones by name.

### `useTempPath`

Creates (and cleans up) a temporary directory, and optionally mocks `process.cwd()` so commands run as if executed there.

```typescript
import { useTempPath } from "./__setup__/hooks";

const {
  beforeAllCalls,
  afterAllCalls,
  joinPath,
  toggleCwdBetweenFullAndParentPath,
} = useTempPath("my-actor", {
  cwd: true,
  cwdParent: true,
  create: true,
  remove: true,
});

const { CreateCommand } = await import("../../src/commands/create.js");
```

Options:

- `create` (default `true`) — create the temp directory in `beforeAll`.
- `remove` (default `true`) — remove it in `afterAll`.
- `cwd` (default `false`) — mock `process.cwd()` to point at the temp directory.
- `cwdParent` (default `false`) — start the mocked cwd at the parent of the temp directory.

Returned helpers:

- `tmpPath` — absolute path of the temp directory.
- `joinPath(...segments)` — `path.join` rooted at `tmpPath`.
- `beforeAllCalls`, `afterAllCalls` — call these from your `beforeAll` / `afterAll`.
- `toggleCwdBetweenFullAndParentPath()` — flip the mocked cwd between the temp dir and its parent.

**Important when using `cwd: true`:** in the code you are testing, always `import process from 'node:process'` (never `globalThis.process`), and dynamically `await import(...)` anything that reads cwd **after** `useTempPath` runs.

### Running individual commands

Use `testRunCommand` from the command framework to invoke CLI commands in tests — it bypasses the entry-point wrapper and gives you the parsed context directly.

## Pull requests

- Branch from `master`. Name branches descriptively (e.g. `fix/push-handles-empty-dir`, `feat/actors-search`).
- Write [Conventional Commit](https://www.conventionalcommits.org/) messages: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. The changelog generator (`git-cliff`) groups entries by prefix, so this matters.
- Keep PRs focused. Unrelated cleanup is easier to review in a separate PR.
- Include tests when you fix a bug or add behavior.
- Update `docs/` via `yarn update-docs` if you changed any command.

Open PRs against `master`. Code owners are configured in [`.github/CODEOWNERS`](./.github/CODEOWNERS) and will be requested automatically.

## Releases

Releases are fully automated via GitHub Actions — **do not bump the version in `package.json` manually**.

- **Pre-releases (beta):** every push to `master` triggers `.github/workflows/pre_release.yaml`, which computes the next beta version, updates `CHANGELOG.md`, and publishes to npm under the `beta` tag.
- **Stable releases:** trigger the **Create a release** workflow (`.github/workflows/release.yaml`) manually from the GitHub Actions UI. It computes the next version (auto / patch / minor / major / custom), updates `CHANGELOG.md`, builds standalone bundles for Linux / macOS / Windows (x64 + ARM64), creates a GitHub release with the bundles attached, publishes to npm under `latest`, and opens a PR against the Homebrew formula.

Only users with publish access to the [`apify-cli` npm package](https://www.npmjs.com/package/apify-cli) can trigger the stable release workflow.
