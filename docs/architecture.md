# Current architecture

Tuiminal uses a Bun workspaces monorepo: one application and six internal packages
with automatically checked responsibilities and dependencies. The current release
still includes every tool in each platform binary. This structure makes code easier
to find, allows rules to be tested without mounting a screen, and lets tools grow
without filling the core with feature-specific implementation details.

## Code map

```text
apps/cli/bin/tuiminal.ts        arguments and invocation directory
apps/cli/src/index.tsx          development entrypoint
apps/cli/src/
  bootstrap.tsx                explicit initialization and renderer
  App.tsx                      composition, navigation, and global modals
  tool-catalog.ts              identifiers, aliases, and shortcuts
  feature-registry.ts          keyboard and shutdown policies
  ui/                          settings and sensitive-data terms
  tutorial/                    tutorial overlay and steps
packages/core/src/
  keyboard/                    keyboard ownership contract
  lifecycle/                   shutdown of all registered resources
  settings/                    theme and preference persistence
  ui/                          reusable controls
  i18n/                        translations, Unicode width, and JSX runtime
  security/                    sensitive-value masking
  data/                        optional-property normalization
  notifications/               visual events and timers for retained cards
  storage/                     atomic writes and project-file limits
packages/feature-runner/src/    commands, processes, logs, and projects
packages/feature-database/src/  catalog, SQL, grid, inspection, and connections
packages/feature-git/src/       files, commits, graph, and diffs
packages/feature-http/src/      requests and responses
packages/feature-terminal/src/ free PTY sessions
tests/                         logic and local integration tests
  tui/                         interaction with the OpenTUI renderer
  fixtures/                    disposable demo projects
scripts/                       architecture and maintainability checks
docs/adr/                      decisions and tradeoffs
```

Each tool exposes only the API needed by the application through `index.ts`. Not
every tool needs every subdirectory: create one for a concrete responsibility,
not an empty file to satisfy a diagram.

Each workspace owns its manifest, exports, and dependencies. Versioning, build,
and installation contracts are documented in
[Internal workspaces](./design/internal-workspaces.md). The former `src/core` and
`src/shared` directories were combined into `packages/core/src`.

## Allowed dependencies

- `apps/cli` composes feature exports and uses `packages/core`.
- Features do not import other features or the application. Runner requests URL
  opening through a callback; the application decides whether to pass it to HTTP.
- `core` knows nothing about features or `apps/cli`.
- `model` contains rules and types without React, OpenTUI, I/O, or service,
  storage, and rendering imports, including type-only imports.
- Services and persistence may use the model. UI uses models and services;
  rendering details remain outside the domain.
- Cycles, unresolved local imports, and application access to feature internals
  are forbidden. `.dependency-cruiser.cjs` checks these rules and discovers new
  features automatically. Its wrapper also fails if any source file is skipped.

`services/runner.ts` remains an internal compatibility facade for consumers within
Runner; it is not a public API or a stable external extension boundary.

## Existing separations

Runner has separate modules for project discovery, language-family detectors,
shell commands, processes, PTYs, the process registry, ports, health checks, and
URL opening. The multi-process panel, status presentation, types, and log preferences
have been extracted from the workspace. Filtering, streaming, and timestamps use
a pure reducer with tested transitions.

The circular log buffer belongs to the model. A dedicated hook publishes bounded
snapshots in batches and closes the buffer with the execution. Project discovery
refills bounded read batches and deduplicates resolved paths. Each PTY owns an
incremental UTF-8 decoder without holding prompts until a newline. Single and Multi
share the native log document without translating stdout/stderr data. Port polling
chains probes without overlap; every helper has bounded capture and cancellation
tied to its owning context.

Database separates the main workspace, SQL workspace, row inspector, and tutorial
demo. Types, selection, staging, and SQL lexing belong to the model; selection export
to disk belongs to storage. OpenTUI editor highlighting uses the lexer, but
autocomplete does not depend on the renderer.

Batch staging indexes changes by connection, table, and primary key once per
operation, preserving original snapshots and transactional review. History filters
and batch writes resolve the connection target outside the record loop, avoiding
repeated configuration snapshot clones. Export previews serialize only a bounded
prefix; explicit actions generate the complete file. Temporary test clients close
on query and MCP discovery failures as well as on success. The SQL editor retains
its native renderable while panes hide or maximize; layout changes do not recreate
its ancestors. SQL executions and approved batches acquire a synchronous guard
before dispatch, independent of React loading state. Row/cell and suggestion colors
live in `query-presentation.ts`, with tests for precedence and palette updates.

Git separates the file tree, commit graph, diff/intraline handling, types, and
presentation. PR and Issues share only the detail-loading lifecycle in
`useGitRemoteDetails`: debounce, request ownership, pagination, and stale-response
disposal. Models and sessions retain their own merge and cache rules. Each session
checks the active request before caching a result; stale callbacks cannot release
a replacement controller.

Database and Runner still have large controllers. Moving files alone does not make
them smaller: the [ADR](./adr/0001-modular-monolith.md) records planned extractions,
and the baseline prevents unnoticed growth.

## Initialization, keyboard, and shutdown

The catalog selects Runner by default in both CLI and development mode. Launch
resolves the tool once per mount: a valid isolated mode takes priority, and unknown
identifiers fall back to the default.

The brand color lives in `packages/core/src/ui/brand.ts`: `#4B75FF`. `ShortcutText`
translates and styles only `[shortcut]` segments in one native text node, preserving
width, wrapping, and inherited label colors. This is an explicit component: the
JSX runtime does not recolor brackets in logs, SQL, or data. `InlineButton` uses it
automatically; mixed help/data content can disable highlighting.

When this component was adopted on 2026-09-04, line budgets for 12 screens changed
only for imports, data opt-outs, and formatter wrapping (1–8 lines per file).
Complexity budgets did not change; that adjustment does not permit controller growth.

Importing the theme neither reads preferences nor changes global language/masking.
The CLI and bootstrap explicitly call `initializeUiSettings()`. Features load after
theme initialization because SQL/diff styles capture colors. Configuration locations
remain unchanged; no user-data migration is required.

Full and isolated modes reuse the same global modal composition in `App`; the
application continues to own state and mounting boundaries.

Batched notifications schedule timers only for the three retained cards. Replacement,
dismissal, and unmount cancel the corresponding timers without renewing other cards'
deadlines. Unicode truncation measures total width, then walks only the graphemes
needed for the prefix. Plasma computes repeated waves once per frame, row, or column,
with character and color regressions.

The unused `DatabaseWriteModal` and its baseline exception were removed. Active
writes still use staging and transactional review; no maintainability budget grew.

Keyboard policies live in `packages/feature-<name>/src/keyboard.ts`. Focused inputs
and pickers retain their shortcuts; modals consume events locally. `[Esc]` first
unfocuses an input and then closes its modal. Database retains deferred Escape
handling, and PTYs retain Ctrl+C. No event bus was introduced, and OpenTUI's native
focus system was preserved.

Shutdown invokes disposers for mounted tools. One failure does not prevent the
others from running. Each module stops only processes/connections it created;
shutting down a tool does not authorize killing processes found through port scans.

## Adding a tool

1. Create `packages/feature-<name>` with a manifest and `src` for the component and
   testable models.
2. Expose the smallest required surface through `src/index.ts` and manifest `exports`;
   declare dependencies and add the package to the `apps/cli` manifest.
3. Register its identifier, aliases, label, and shortcut in `apps/cli/src/tool-catalog.ts`.
4. Declare keyboard policy and, if needed, a disposer in
   `apps/cli/src/feature-registry.ts`. Do not put internal IDs directly in `App`.
5. Add its panel to `App`, respecting `active`, visited tabs, and isolated mode.
   Mounting only the selected tool does not imply dynamic loading of its code;
   that optimization is not implemented yet.
6. Add translations, unit/TUI tests, documentation, and an appropriate tutorial.
7. Run the full gate. Do not substitute `@ts-ignore`, `any`, or relaxed rules for
   correctly modeled state and optional values.
