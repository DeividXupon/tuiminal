# ADR 0001 — Modular monolith of internal features

Status: accepted on 2026-09-04; revised on 2026-09-14.

## Context

The initial analysis found 41 source files with roughly 27,700 lines. Database
combined 5,720 UI lines, Runner 3,036, and Git 2,142. The entrypoint mixed a tool,
application composition, and bootstrap. Models imported service types, and the
global guard knew dozens of internal input and modal IDs.

Moving directly to independently distributed packages would have introduced
versioning, builds, and compatibility concerns before module boundaries were stable.

## Decision

Organize independent application, core, shared, and feature modules; extract cohesive
responsibilities; check dependencies, types, and interactions before considering
optional distribution of official components. Use small reducers for related state,
and preserve refs, component identity, processes, and sessions during migration.

The 2026-09-14 revision implements these boundaries as workspaces: `apps/cli`,
`packages/core` (including the former shared directory), and five `packages/feature-*`
packages. The product remains integrated with synchronized versions, now using
individual manifests and verifiable npm artifacts. Contracts and boundaries are
recorded in [Internal workspaces](../design/internal-workspaces.md). This revision
does not implement optional downloading.

Standardize on Bun 1.3.14, Biome formatting, strict TypeScript, and Linux/macOS CI.
Enable `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`,
and `noFallthroughCasesInSwitch`. Omit absent values at normalization boundaries;
drafts that allow clearing fields declare that explicitly.

Dependency-cruiser 18 requires the pre-TypeScript-7 AST API. Keeping the native 7
compiler under an alias and API 6 as a development-only dependency prevents an
empty report from being accepted as “zero violations.” The wrapper requires every
source file to be analyzed. Revisit this arrangement when native API support exists,
without changing the production runtime.

## Consequences and limitations

- More files, with an identifiable home for each responsibility.
- Shortcuts, layout, saved data, and user configuration formats remain unchanged.
- Import review and formatting account for most of the change, rather than new logic.
- Native TUI tests from the initial extraction cover Runner, the save modal, and
  composition with App; they do not provide complete visual coverage of every tool.
- Large functions and controllers remain. Existing warnings stay visible, and the
  baseline caps file size and complexity; technical debt has not been eliminated.
- No comparative performance measurement was made during this step. Better
  organization is not evidence of reduced latency.
- A public SDK, marketplace, and community plugin loader are not planned. Features
  remain official internal parts of Tuiminal.

## Initial extraction validation (2026-09-04)

Local validation passed: `bun install --frozen-lockfile`, `bun run check`, `bun test`,
and `git diff --check`. There were 127 passing tests (124 logic/local integration
and 3 TUI), 6 skipped opt-in Docker cases, and no failures. The graph covered 96
source modules and 417 dependencies without violations. The 60 existing complexity
warnings remained in the baseline, with no gate regressions. Runner was also opened
through the CLI with temporary configuration to check multi mode, typing, and the
save modal. CI was configured but not run remotely for that change.

## Next extractions, in order

1. Runner: execution/restart/health and session lifecycles; smaller command-panel,
   picker, history, and log contracts with navigation tests.
2. Database: connection/history persistence, MySQL/Postgres/SQLite adapters, and
   execution/cancellation; decompose grid and SQL controllers by state transactions.
3. Git: reduce navigation control and expand graph/diff/rendering tests.
4. Expand TUI tests for Database, PTYs, resize, mouse, and all languages.
5. If minimal installation is adopted, prototype one official feature as an optional
   payload with a private contract versioned with the core before changing packaging
   for other tools.

Each extraction must preserve behavior and reduce the baseline. Do not move an
entire controller into `useWorkspace.ts` merely to shrink the visible file.
