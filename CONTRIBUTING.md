# Contributing to Tuiminal

## Getting started

Use Bun 1.4.2 (`.bun-version`). From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

The CLI runs the source directly; there is no need to rebuild or reinstall the
global command after each edit. Do not change another developer's global link.
To launch Runner with disposable configuration:

```sh
task_config=$(mktemp -d)
XDG_CONFIG_HOME="$task_config" bun apps/cli/bin/tuiminal.ts runner tests/fixtures/runner-project
```

Remove that temporary directory after closing **that** instance. Do not stop the
user's processes, databases, or other application instances during tests.

## Where to work

Write maintained documentation in English. Keep `README.md` and its Brazilian
Portuguese counterpart, `README.pt-BR.md`, synchronized in the same change. Preserve
commands, configuration keys, identifiers, fixture data, and third-party license
text when translating; documentation language does not change the application's
supported UI languages.

Read the [architecture guide](./docs/architecture.md). Start with the relevant tool
in `packages/feature-<name>/src`. The CLI lives in `apps/cli`, and shared code lives
in `packages/core`. `bun install` links workspaces by package name; cross-package
imports must use their exports and declare dependencies in the owning manifest.
Pure rules belong in `model`; processes, disk, and network access belong in
services/drivers/storage; components and OpenTUI integration belong in the UI layer.

Avoid generic abstractions without concrete uses. Do not create a `utils.ts` that
mixes unrelated concerns or a hook containing all of a tool's logic. Preserve the
localized JSX runtime: replacing it with standard JSX breaks translations.

## Quality commands

| Command | Purpose |
| --- | --- |
| `bun run format` | Apply the standard formatting |
| `bun run typecheck` | Check strict types with native TypeScript 7 |
| `bun run lint` | Find problems and complexity warnings |
| `bun run check:workspaces` | Check package versions and declared dependencies |
| `bun run check:architecture` | Reject cycles and forbidden imports between layers |
| `bun run check:maintainability` | Prevent growth beyond reviewed budgets |
| `bun run test:unit` | Run deterministic logic and local integration tests |
| `bun run test:tui` | Exercise the real OpenTUI renderer with simulated keyboard input |
| `bun run test:packages` | Compile, pack, and consume modules outside the monorepo |
| `bun run check` | Run static gates, formatting, and the unit/TUI suites |
| `bun run test:database:drivers` | Run the opt-in Docker matrix, outside the normal gate |

Bun runs these commands, including dependency-cruiser. The main compiler remains
TypeScript 7 (`typescript-native`, an npm alias). The `typescript` 6.0.3 dependency
provides the AST API required by dependency-cruiser 18. Do not replace `typecheck`
with `bunx tsc`, which may resolve the other compiler. Revisit this compatibility
arrangement when the analyzer supports the native API.

The `hoisted` linker is fixed in `bunfig.toml`. Host overrides keep one copy of
React 19.2.8 and OpenTUI 0.5.9: Tuiparts 0.0.6 still declares OpenTUI 0.4 peers,
although Tuiminal uses and tests this newer combination. The tarball test reproduces
these overrides in a temporary consumer, installs with strict npm peer validation,
and checks runtime identity, rendering, and types. These modules are internal host
components, not libraries supporting arbitrary React/OpenTUI versions.

## Tests and review

1. Add tests for pure rules and regressions for changed interactions.
2. Use local fixtures and temporary configuration, never real credentials.
3. For focus/keyboard changes, test the component **and** its composition with
   `App`. Exercise a real CLI instance when the sequence can be automated.
4. Run `bun run format`, `bun run check`, and `git diff --check`.
5. Update README/AGENTS when behavior or shortcuts change; record durable
   architectural decisions in `docs/adr`.

CI runs the full suite and package tests on Linux and macOS. Windows x64 runs all
static checks and the explicit portable suite. The Docker matrix remains opt-in.
Bun coverage only includes loaded files: a high percentage alone does not establish
coverage of every screen. Do not replace interaction tests with source-text searches.

## Existing technical debt

`docs/quality-baseline.json` records exceptions for large files and functions above
complexity 20. The checker compares file sizes and complexity distributions; it does
not establish architectural quality by itself. New functions should remain small
and testable even when reducing another function creates room in the gate.

Prefer reducing exceptions. Changing the baseline requires justification and review.
`bun scripts/check-maintainability.ts --write-baseline` is an **explicit maintenance
operation**, never an automatic step in the check or CI.

## Contribution license

By contributing to Tuiminal, you agree to license your contribution under the
[Apache License 2.0](./LICENSE), unless a separate written agreement states otherwise.

## Testing official installation

`bun run dev` builds the five official payloads and opens the installer on a fresh
checkout. Feature code is loaded from the installed snapshot; restart the dev command
(or rebuild with `bun run build:features` and restart the application) before
installing the new snapshot after editing a tool.
`dev-features` storage is separate from release installations. Tests explicitly use
source workspaces except the download/installation regressions and release smoke,
which consume real archives in disposable storage. Do not preload every feature in
the unit-test setup: some suites establish storage fixtures before importing services.
The [installation contract](docs/design/official-feature-installation.md) describes
storage, cancellation, integrity and canonical release artifacts.
