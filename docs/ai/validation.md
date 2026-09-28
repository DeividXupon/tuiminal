# Validation and release

Use for tests, gates, CI and packaging. Scripts in [package.json](../../package.json)
are authoritative; install with `bun install --frozen-lockfile`.

## Checks

| Affected surface | Check |
| --- | --- |
| Agent Markdown | `bun run check:ai-docs`, `git diff --check` |
| Logic | Focused `bun test tests/<file>.test.ts`; update automated regression coverage |
| Native UI | `bun test --preload ./tests/tui/setup.ts tests/tui/<file>.test.tsx` |
| Whole source / requested commit | `bun run check` (includes full unit/TUI suite and static gates) |
| Internal package exports/runtime | `bun run test:packages` |
| Database drivers | `bun run test:database:drivers` (opt-in isolated Docker matrix) |
| Release artifacts | [Release process](../release-process.md) and native candidate matrix |

Run focused checks during implementation, broadening for affected boundaries.
Avoid repeating unchanged checks or running all constituent gates before check.
The offline unit script uses `--max-concurrency=1` for shell/PTY lifecycles.
`typecheck` uses native TypeScript 7; TypeScript 6 supplies dependency-cruiser's AST.
`bun run format` applies Biome.

## Test isolation and reliability

- `tests/setup.ts` is preloaded even for plain bun test. TUI setup shares its
  launch fixture. Register temporary roots immediately, clean those exact paths
  in finally/afterEach after owned I/O/process retirement, including assertion failure.
- Use local ephemeral servers/disposable databases, never real settings, credentials
  or foreign processes. For manual TUI regressions use isolated XDG config and the
  demo SQLite database. Terminal also needs its [discovery overrides](terminal.md#validation).
- Changed focus/modal/mouse/PTY/key propagation needs the real interaction sequence
  as well as automated coverage where automatable. Await loaded data and native
  geometry instead of sleeps. Do not weaken assertions or mock away the behavior.
- Notification tests render before invoking the actual scheduled callback and
  retain timer-cleanup assertions. Native TUI fixtures disable only optional React
  User Timing telemetry; preserve real renderer/input, clocks and reconciler.
- Static architecture coverage fails closed. Normalize path separators consistently.
  Maintainability budgets normally allow 400 lines/file and complexity 20;
  existing debt cannot grow. Baseline edits need a written reason and review.
- Settings writes flush files before atomic rename everywhere; directory fsync is
  POSIX-only. Preserve backups/conflict detection and native Windows storage tests.

## Packaging and release

Read [workspaces](../design/internal-workspaces.md) for package contracts and
[release process](../release-process.md) for the full candidate/publication gates.

- All seven source workspaces stay private and version-aligned. Public artifacts
  are the launcher plus six native platform packages, with Apache-2.0 licenses.
  Preserve the hoisted linker and exact shared host UI runtime/lockfile versions.
- Use one canonical feature catalog via `TUIMINAL_RELEASE_FEATURES_DIR` for all
  targets. Source UI tests cannot prove installed host/payload bindings or SQLite
  worker IPC; test real tarballs, clean installation and all downloaded tools.
- CI runs full Unix suites and the maintained portable Windows suite on
  windows-2025 with LF checkout. Native platform/driver evidence is separate
  from source-only checks; report exact SHA, covered/skipped targets and risks.
- Alpha publication uses protected main/npm environment, Trusted Publishing and
  immutable successful candidate/quality artifacts. Feature assets precede
  platform packages and launcher. Reconcile uncertain writes; never overwrite
  accepted versions/assets or infer publication authority from green checks.
- Parse npm pack JSON through the shared helper (array and npm 12 keyed formats),
  validating one exact package/version, filename, integrity and contents.
- Reconcile GitHub drafts through authenticated paginated listings; retain write
  responses and refresh identified drafts by ID. Eventual-consistency reads never
  justify replaying creation; retargeting preserves tag_name and target_commitish.
