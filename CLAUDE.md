# CLAUDE.md

Guidance for Claude Code (and similar AI coding assistants) working in this repository. Humans should read [README.md](./README.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Project overview

Apify CLI is a TypeScript CLI for creating, developing, and deploying Apify Actors and managing the Apify cloud platform. It ships as:

- `apify` — the main CLI, entry point `src/entrypoints/apify.ts`
- `actor` — the in-Actor helper CLI, entry point `src/entrypoints/actor.ts`

The CLI is published to npm as `apify-cli` and distributed as standalone bundles (Linux/macOS/Windows, x64 and ARM64). Bundles are built with Bun; the npm package is built with `tsup` + `tsc`.

## Key directories

- `src/commands/` — command implementations. One file or folder per command. Subfolders (e.g. `builds/`, `secrets/`, `actors/`) group subcommands; `_index.ts` is the parent command, `_register.ts` registers everything.
- `src/lib/` — shared libraries: `command-framework/` (custom oclif-style framework built on top of `ApifyCommand`), `hooks/` (reusable runtime hooks including `telemetry/`), `utils/`, `outputs/`, etc.
- `src/entrypoints/` — thin entry points for `apify` and `actor` binaries.
- `test/local/` — local tests (no Apify API calls).
- `test/api/` — tests that hit the real Apify API. Require `TEST_USER_TOKEN`.
- `test/__setup__/hooks/` — shared test hooks (`useAuthSetup`, `useTempPath`). See [CONTRIBUTING.md](./CONTRIBUTING.md#writing-tests) for usage notes.
- `features/` — Cucumber feature files and step definitions.
- `scripts/` — build, docs generation, and release helper scripts.
- `website/` — Docusaurus docs site published to docs.apify.com/cli.
- `docs/` — generated command reference (written by `yarn update-docs`; do not edit by hand).

## Common commands

Package manager: **Yarn 4** (via Corepack — do not use npm for development).

| Task                     | Command                                 |
| ------------------------ | --------------------------------------- |
| Install dependencies     | `yarn`                                  |
| Run CLI in dev mode      | `yarn dev:apify <args>`                 |
| Run `actor` binary       | `yarn dev:actor <args>`                 |
| Build                    | `yarn build`                            |
| Build standalone bundles | `yarn build-bundles` (needs Bun)        |
| Lint (ESLint)            | `yarn lint`                             |
| Auto-fix lint            | `yarn lint:fix`                         |
| Format check             | `yarn format`                           |
| Auto-format              | `yarn format:fix`                       |
| Local tests              | `yarn test:local`                       |
| API tests                | `TEST_USER_TOKEN=<token> yarn test:api` |
| Python support tests     | `yarn test:python`                      |
| Cucumber tests           | `yarn test:cucumber`                    |
| Regenerate CLI docs      | `yarn update-docs`                      |

## Before you push

Always run the following locally before pushing a branch or opening a PR. The pre-commit hook (`lint-staged`) covers staged files, but CI runs the full suite — save a round trip by doing it yourself:

1. `yarn lint` — ESLint on `src`, `test`, `scripts`, `features`.
2. `yarn format` — Biome (JS/TS) and Prettier (Markdown/YAML) formatting check.
3. `yarn build` — TypeScript compile + tsup bundle. Fails fast on type errors.
4. `yarn test:local` — local unit/integration tests (no API). Run `yarn test:api` too if you changed anything that touches the Apify API.

Do not use `--no-verify` to skip hooks. If a hook fails, fix the underlying issue and make a new commit.

If you modified a command's flags, args, description, or added/removed a command, also run `yarn update-docs` and commit the regenerated `docs/` output.

## Code conventions

- Formatting: **Biome** for JS/TS (tab indentation — see `biome.json`), **Prettier** for Markdown/YAML.
- Linting: **ESLint** using `@apify/eslint-config`.
- TypeScript: ESM (`"type": "module"`). Use `.js` import specifiers for local files (e.g. `import { foo } from './foo.js'`). The `.ts` source resolves at build time.
- Commands extend `ApifyCommand` from `src/lib/command-framework/apify-command.ts`. Follow the pattern of existing commands: `static override name`, `static override description`, `static override flags/args`, and an `async run()` method.
- New commands must be registered in `src/commands/_register.ts` (or the parent `_index.ts` for subcommands).
- Do not add docstrings, comments, or type annotations to code you did not change. Keep diffs tight.

## Testing patterns

Tests use **Vitest**. Two test hooks in `test/__setup__/hooks/` deserve attention:

- `useAuthSetup({ perTest?: boolean })` — isolates Apify auth state. Required for any test that logs in, pushes, pulls, or otherwise touches `~/.apify`.
- `useTempPath(name, opts)` — creates a temp directory, optionally mocks `process.cwd`. **If you mock cwd**, you must `import process from 'node:process'` in the code under test (never `globalThis.process`) and dynamically `await import(...)` modules that read cwd _after_ calling `useTempPath`.

API tests must include `[api]` in the test name and live in `test/api/` — the `test:local` script filters them out by name.

Detailed examples are in [CONTRIBUTING.md](./CONTRIBUTING.md#writing-tests).

## Release flow

Releases are fully automated — do **not** bump the version in `package.json` by hand.

- Every push to `master` triggers `.github/workflows/pre_release.yaml`, which cuts a beta release and publishes to npm under the `beta` tag.
- Stable releases are triggered manually via the **Create a release** GitHub Action (`.github/workflows/release.yaml`), which updates `CHANGELOG.md`, publishes to npm under `latest`, builds standalone bundles, creates a GitHub release, and updates the Homebrew formula.

Conventional-style commit messages feed `git-cliff` for the changelog. Use prefixes like `feat:`, `fix:`, `docs:`, `chore:`.

## Things to avoid

- Do not edit `docs/` manually — it is generated from command definitions by `yarn update-docs`.
- Do not edit `CHANGELOG.md` manually outside of the release workflow.
- Do not use `globalThis.process` in command/lib code — always `import process from 'node:process'` so test cwd mocks work.
- Do not add npm lockfiles (`package-lock.json`) — this repo uses Yarn.
- Do not bypass git hooks with `--no-verify`.
