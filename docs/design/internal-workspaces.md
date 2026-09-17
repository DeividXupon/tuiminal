# Internal workspaces

The repository contains seven Bun workspaces. All are official components of the
same product and follow the root version; cross-package contracts are internal.

| Directory | Name | Responsibility |
| --- | --- | --- |
| `apps/cli` | `@xupon/tuiminal-cli` | Entrypoint, bootstrap, and screen composition |
| `packages/core` | `@xupon/tuiminal-core` | Settings, UI, i18n, and shared infrastructure |
| `packages/feature-git` | `@xupon/tuiminal-feature-git` | Local Git and GitHub |
| `packages/feature-database` | `@xupon/tuiminal-feature-database` | Database, SQL, and drivers |
| `packages/feature-runner` | `@xupon/tuiminal-feature-runner` | Commands and processes |
| `packages/feature-http` | `@xupon/tuiminal-feature-http` | Interactive and headless HTTP |
| `packages/feature-terminal` | `@xupon/tuiminal-feature-terminal` | PTY terminals |

## Development and dependencies

`bun install --frozen-lockfile` at the root installs and links every workspace.
`bun run dev` builds local official payloads and launches the installation flow; the source CLI entrypoint
is `apps/cli/bin/tuiminal.ts`. The working directory remains the user's selected
project, independent of the installation location.

Each package declares its production imports in `dependencies` or `peerDependencies`.
Cross-workspace imports use npm names and only paths declared in `exports`; relative
imports stay within their package. Core exposes small subpaths to preserve explicit
initialization and prevent version queries from loading UI or services. Features
expose `src/index.ts`; HTTP also exposes `cli/run` and `cli/import` for headless commands.

The CLI depends on all six packages through `workspace:*`. Features require the
exact core version as a peer and use `workspace:*` during local development. React
and OpenTUI are shared peers, preserving a single identity for hooks and the renderer.
The linker is `hoisted`. Host overrides retain React 19.2.8 and OpenTUI 0.5.9;
Tuiparts 0.0.6 declares older peers, so consumers of these internal components must
reproduce the combination documented in the [contribution guide](../../CONTRIBUTING.md).

## Packaging

Source manifests are private. `bun run build:packages` compiles JavaScript and
TypeScript declarations into six publishable directories under `dist/packages`.
Each contains only `dist`, a manifest, README, Apache-2.0 license, and third-party
notices. Exports point to `.js` and `.d.ts`; internal dependencies use exact versions.
`repository.directory` links each package to its directory in this GitHub repository.
Separate companion repositories are not required.

This command does not publish anything. Emitted components require the host's Bun
runtime; npm installation does not make them plain Node libraries. Database includes
its JavaScript SQLite helper for subprocess execution.

`bun run build:release <platform>` generates the `tuiminal` npm launcher and
minimal binaries under `dist/npm`, plus version-matched official downloads.
The downloaded SQLite worker runs through the host executable over IPC.
End users do not need Bun for this distribution. Source, internal packages, and
executables must share one version before a release is built.

## Verification

- `bun run check:workspaces`: versions, private source manifests, repository metadata,
  declared imports, and no relative imports escaping package boundaries.
- `bun run check:architecture`: independent features, core independent of the app,
  pure models, CLI use of exported APIs, and no cycles.
- `bun run check`: these gates, types, formatting, licenses, baseline, and the complete
  existing suite. Migration changes baseline paths without expanding budgets.
- `bun run test:packages`: compile and `npm pack`, install all six tarballs in a
  temporary consumer with strict peers and host overrides, then check type/runtime
  exports, shared React/OpenTUI identity, localized rendering, and real execution
  of the emitted SQLite helper. Linux and macOS run this check in CI.
- `bun run test:release <platform>`: verify standalone artifacts and their final
  installation using the [release process](../release-process.md).

During the local migration on `refactor/internal-workspaces`, based on `development`
(`8476cb2`), the gate passed with 1,003 logic/integration and 257 TUI tests; the 11
existing opt-in cases remained skipped. All six tarballs passed in an isolated
consumer, and standalone build/tests passed on macOS x64. The graph covers 535
source files without violations, and baseline budgets were preserved. This evidence
does not cover native execution on other platforms or npm publication.

## Official installation

The workspaces now supply the [official feature installation](official-feature-installation.md)
flow. A minimal CLI installs exact-version payloads in its own data directory, then
loads only the selected tools. The npm workspace tarballs remain internal packaging
artifacts; the user-facing installer consumes the verified payload archives, not npm
commands. No public SDK or community plugin loader exists.
