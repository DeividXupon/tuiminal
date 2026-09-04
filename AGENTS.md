# Tuiminal agent notes

This file records durable project conventions, architectural decisions, and recurring pitfalls that future agents need in order to work consistently.

## Product direction

- Tuiminal is an extensible, polished developer workspace built with Bun, OpenTUI, React, and tuiparts. It should feel like one integrated terminal application, not a collection of disconnected demos.
- `PLUGIN_SYSTEM_PLAN.md` records the future direction for an installable public plugin ecosystem. It is intentionally mutable and is not a description of current behavior or a frozen API. Review and update it when prototypes or implementation evidence change the proposed phases, commands, manifest, permissions, isolation model, or packaging.
- The intended plugin architecture gives official and community plugins the same public SDK; the core must not retain privileged tool-specific imports after migration. Keep the current built-in application working during the incremental transition.
- It must work from any project directory. Git, Runner, and Free Terminal use the directory passed to the CLI or the current directory; they must not be tied to this repository.
- The primary tools are Database, Git, Runner, HTTP, and Free Terminal. New substantial tools belong in their own top-level tab instead of being forced into an unrelated tab.
- Keep the interface dense and responsive so useful content, especially code, diffs, tables, logs, and PTYs, receives most of the available space.

## Maintaining these notes

- Update this file whenever a task establishes a reusable UI rule, architectural decision, important workflow, or non-obvious implementation constraint.
- Record information that will still matter in future tasks. Do not add temporary progress, debugging logs, secrets, credentials, or machine-specific transient paths.
- When adding or substantially changing a feature, update both this file and `README.md` if the user-facing behavior or documented shortcuts changed.
- Keep existing user work intact. The worktree may contain intentional uncommitted changes from ongoing development.
- Do not commit, push, publish, change repository visibility, or kill user processes unless the user explicitly requests that action.

## Global navigation and CLI

- Global tabs use symbols rather than numbers: `[@]` Database, `[#]` Git, `[$]` Runner, `[%]` HTTP, and `[^]` Free Terminal. Number keys remain available for local actions inside tools. Runner is the default screen for normal CLI and development startup; unknown or removed tool IDs must fall back to it, not mount an empty panel.
- `[,]` opens global settings. All top-level tabs, buttons, lists, fields, commits, diffs, and scrollable areas should remain usable with the mouse.
- The CLI accepts an optional project directory and isolated-tool subcommands. Supported aliases include `banco`/`database`/`db`, `git`, `runner`/`run`, `http`, and `terminal`/`term`/`tty`.
- `tuiminal <tool> [directory]` mounts only the requested tool. Do not initialize hidden tools or their processes in isolated mode.
- The global CLI entry is `bin/tuiminal.ts` and runs directly through Bun; source changes do not require a separate compilation step. After local global-link testing, ensure `~/.bun/bin/tuiminal` still targets this entrypoint.

## UI and interaction conventions

- Every visible keyboard activation must be enclosed in brackets. Use `[Esc]`, `[Enter]`, `[Ctrl+S]`, `[↑/↓]`, and `[E/Enter]`; never show bare shortcut names in help text or action labels.
- The TUIMINAL wordmark and bracketed keyboard hints share the fixed brand accent `#4B75FF` across palettes. Use `ShortcutText` for UI hints (`InlineButton` already uses it); only key tokens change color, while labels retain their semantic/focus colors. Never apply hint styling to logs, SQL, commands, PTY output or arbitrary user data. Use `highlight={false}` for data branches of mixed hint/data text.
- Keyboard actions exposed in the interface should also have a mouse-accessible control whenever practical.
- `[Esc]` closes only the topmost active layer. A modal must consume the event with `preventDefault()` and `stopPropagation()` and must not allow the same keypress to close its parent screen or the application.
- Application-level Database exit on `[Esc]` must wait for local workspace handlers to consume the event. Grid/query batch selection uses `[Esc]` to clear itself even when no modal input owns focus; never quit synchronously before checking `defaultPrevented`.
- Any focusable modal control must be recognized by its feature's `keyboard.ts` scope, consumed by the application-level guard in `src/app/App.tsx`, including empty modal states where the dialog itself receives focus. Preserve local Escape handling and event consumption.
- Text inputs follow a focus stack: `[Esc]` first dismisses autocomplete or unfocuses the active input, a later `[Esc]` closes its containing screen, and only the final global action may exit the app.
- Never let global shortcuts fire while a text input, SQL editor, terminal, picker, or modal owns the keyboard.
- Both layout modes are first-class: `framed` uses gaps and borders; `compact` removes gaps and most borders and separates panels through subtle background differences.
- Settings are contextual. In the Database tab or isolated Database mode, `CONFIGURAÇÕES DO BANCO` appears first and contains sensitive-data terms and SQL history, followed by `CONFIGURAÇÕES GLOBAIS`. In every other tool, hide both Database sections entirely and show only the global divider with palette, layout, language, and tutorial. Keyboard section cycling must use this same visible order and never focus a hidden section. Keep a one-row vertical gap between option groups, scroll whole section groups into view, and keep viewport culling disabled in this short list; culling causes partially redrawn rows when navigating back upward in OpenTUI.
- Avoid decorative boxes around every element. Prefer simple `─` and `│` separators where maximizing content space matters.
- Animations must not remount inputs, reset focus, or make syntax highlighting flicker. Keep editor/renderable refs stable and update highlights in place.
- Keep selected/focused states obvious through accent color and background, not only through a subtle border.
- In compact layout, inactive inline controls inherit the surrounding panel instead of painting `panel` rectangles. Active Database cells and inspector fields use the palette's dark `databaseSelectionBg` with normal text; reserve the bright database accent as a solid selection background for framed layout so 256-color terminals keep states distinct.

## Appearance, language, and tutorial

- Settings persist in `~/.config/tuiminal/settings.json`. Current palettes are Prime, Midnight, Nord, and Gruvbox; current layouts are framed and compact. The same file stores the user-configurable sensitive column-name terms.
- Supported UI languages are Brazilian Portuguese, English, Spanish, Japanese, Simplified Chinese, and Korean.
- All fixed user-facing text must go through `translateUi` and have an entry or pattern in `src/shared/i18n/index.ts`. Changing language must update the complete interface, not only navigation labels.
- Unicode width and truncation must remain grapheme-aware so Asian text does not break borders or alignment.
- The tutorial is a settings option. Its floating card is anchored to the item being explained, resizes/repositions between steps, highlights the current target, and dims unrelated areas.
- Keep each tour focused on the active tool; do not add global navigation or settings steps. Every tutorial target and every translation entry must have regression coverage so stale anchors are caught before release.
- Keep the transparent mouse hit area over the current tutorial target paintless. Giving that overlay even a nearly transparent background erases wide Asian glyphs in OpenTUI; the surrounding dim regions provide the visual treatment.
- The Database tutorial uses simulated hardcoded catalog, table, row, and write-state data so every step remains demonstrable without a configured database. Do not access a real database from tutorial mode.
- The Database demo must cover table history, sort/search, batch row/page selection, export, staged single/batch writes, review, the row inspector, and pagination. Selected demo rows use the same `○`/`●` gutter language as the real grid.

## Git workspace

- `GIT_PR_PLAN.md` and `docs/design/git-pr-interface.md` describe the future `[1] Base` / `[2] PR` workspace inspired by gh-dash. They are mutable plans, not current behavior. Preserve the existing local Git workspace as Base; implement PR responsibilities in separate models/services/UI, not by growing the current controller. Review both documents before implementing phases and keep requirements, intentional UX deviations, API capabilities, safety and tests synchronized.
- Git behaves like a compact lazygit-style workspace for the repository from which Tuiminal was launched.
- The changed-file tree is grouped into real folders and distinguishes staged and unstaged changes. Staging one file or all files must refresh the view without losing useful selection context.
- A small commit graph remains visible under the file tree; fullscreen graph mode replaces the code/diff area. Graph rows show short hash and author initials.
- Commit lanes need distinct, stable colors and clean Unicode connectors similar to lazygit. Do not render every branch/lane in the same color.
- Diff modes include unified, side-by-side, and intraline. Intraline mode represents a modified line once and highlights only the changed characters, rather than always showing separate full `-` and `+` lines.
- Diffs show old/new line numbers, syntax highlighting, hunk context, additions/removals, and should remain visually stable without highlight flicker.
- Commit history supports author/date/statistics and opening a commit diff. Keyboard and mouse navigation must work in files, commits, graph, and diff views.

## Runner and long-running processes

- Runner detects commands for JavaScript package managers, Composer/PHP, Laravel, Symfony, Python/Django, Go, Rust, Ruby/Rails, Maven, Gradle, .NET, Deno, Taskfile, Makefile, justfile, and Docker Compose. A manual command input is always available as fallback. Treat its content as the literal command: once non-empty, show a highlighted `Save command [Ctrl+S]` action beside the input flow. Saving opens a modal that collects the display name and an explicit PTY choice; PTY is off by default and the modal explains that it is intended for shells, REPLs, menus, and programs that request input rather than ordinary log-only scripts or servers.
- Long-running commands are process sessions, not one-shot log entries. Selecting an already running command opens its existing process; it must not execute again. A separate `[R]` action explicitly starts another instance.
- `PROCESSOS ATIVOS` and discovered listening ports live directly below detected commands. Display useful URLs such as `127.0.0.1:8000` and associate ports with their owning process/project.
- The last Runner action, `[+]`, opens another project; pressing `+` opens the same picker from any Runner pane, including multi view and the empty-project state. Text inputs and modals retain their own keyboard handling. It searches Git repositories, filters by name/path, and provides a filesystem picker. Processes remain alive when switching projects.
- Runner project tabs use local number shortcuts `[1]`–`[4]`; do not reuse the global `@ # $ % ^` symbols here.
- Every Runner project tab has a mouse close control. `[Ctrl+X]` closes the active project tab without stopping its processes; closing the active tab selects its nearest remaining neighbor, and closing the last tab opens the project picker.
- Single-process and multi-process views are both supported. Multi view shows up to three logs side by side when space allows, with clear focus and navigation to additional groups.
- In the single-process Runner view, commands, log, and expanded history are keyboard-focusable regions. `[L/→]` moves commands to the log; `[H/←]` returns from the log or history to commands; log `[J/K]` or arrows scroll; opening history focuses it, moving up from its first item returns to the log above, and moving down from the log's bottom edge enters the open history. Show at most eight history items at once.
- Runner imports `.tuiminal/runner.yaml`, `mprocs.yaml`, `Procfile`, and `Procfile.dev`; only an explicit Tuiminal `autostart: true` may start a process automatically. Saved manual commands and session metadata live in `~/.config/tuiminal/runner.json` with restricted permissions.
- Runner always opens the directory supplied to the current CLI invocation. Restored session tabs must never replace that directory and must be scoped by that launch project's resolved root, so starting Tuiminal in another project gets an independent tab/profile session. Resolve a nested Git working directory to its repository root; when no runnable project or Git repository exists, show the empty-project state and project picker instead of treating the arbitrary directory as a project.
- Runner groups are multi-selection actions, not dependency graphs: selected commands start in parallel and may be stopped or restarted together. Interactive commands use a PTY; ordinary commands still expose stdin.
- Environment profiles come from Runner YAML and detected `.env*` files. Command-level environment values override profile values. Persist process logs only when the command opts in, or when the user explicitly exports them to the project `tuiminal-logs/` directory.
- Keep high-volume Runner output lightweight: batch state updates, retain a bounded in-memory buffer with amortized trimming, and render the single-process log as one styled native text document rather than one React/OpenTUI renderable per line. Navigation and live output must remain responsive at the full retained log limit.
- Listening-port actions may open the browser, copy the URL, or prefill the HTTP tab. Session restoration recovers projects, view/profile choices, and completed history, never orphaned live processes.
- Processes started by Runner are stopped when Tuiminal exits. During development or testing, never kill unrelated user processes; stop only exact PIDs or sessions started by the current test.

## HTTP client

- `HTTP_CLIENT_PLAN.md` records the mutable future direction for the HTTP workspace.
  It is not a description of current behavior; update it when implementation or
  prototype evidence changes the planned UX, file format, security model, phases,
  or CLI surface.
- The HTTP workspace is being rebuilt from scratch. Do not migrate or copy its
  previous feature-specific components, state, models, helpers, execution flow, or
  tests. Reuse is limited to Tuiminal-wide infrastructure and the minimal public
  contracts required by App/Runner, keyboard ownership, theme, i18n, and lifecycle.
- Future HTTP layout work uses content-constrained responsive modes documented in
  that plan: ultrawide three-column, normal sidebar plus request/response split,
  focused split with sidebar drawers, and a one-pane minimum mode. Resizing may
  recompose panes but must preserve drafts, editor state, focus ownership, response
  identity, and shortcut meaning.
- Keep the HTTP document strip and method/URL/environment/send omnibar stable. Use
  progressive disclosure for builder/response capabilities and a short contextual
  footer instead of exposing every advanced tab and keybinding at once. HTTP status,
  focus, dirty state, errors, truncation, redaction, and production environments
  must remain understandable without color or animation.
- HTTP is a compact Postman-like client with method selection, URL, headers, text/JSON body, cancellation, response status/duration/size/headers, formatted JSON, and session history.
- Normalize URLs without a scheme to HTTP, add JSON content type when appropriate, retain a 30-second timeout, cap response storage around 1.5 MB, and keep up to 30 session requests.
- Editing fields, submitting, switching request/response panes, history navigation, cancellation, and response scrolling must work through keyboard and mouse.
- Request `Mais` has stable local sections `[1] Opções`, `[2] Assertions`, and `[3] Chaining`. Assertions and extracted variables are first-class request state, round-trip through `.http`, and must be validated before save or transport. A custom HTTP token method is edited under Options; cycling away from a custom method returns to the known method list predictably.
- Sending one request and running a collection use the same dependency/assertion/extraction engine. Resolve dependencies topologically even when collection file order differs. Secret environment or extracted values stay in volatile memory and must be removed from report URLs and diagnostics regardless of the query/header field name.
- Closing a non-final dirty HTTP document requires the discard confirmation layer. `[D]` confirms, `[Esc]` returns, and the same rule applies to keyboard and mouse tab-close controls.
- A save conflict caused by an externally changed `.http` file opens a redacted
  diff instead of overwriting it. `[R]` reloads the external block, `[L]` applies
  the local block to the latest file, `[C]` saves the local version as a new copy,
  and `[Esc]` returns without changing either version. Every action also has a
  mouse control; when the original block was removed, only saving a copy is safe.
- Request `Mais` includes `[4] Preview`, which displays the exact prepared method,
  redacted URL, headers with inheritance origin, resolved variables, execution
  options, and bounded body before sending. Exiting the application while any HTTP
  draft is dirty requires a top-level confirmation and must suspend the HTTP layer.
- `[E]` opens the HTTP environment manager; it no longer cycles environments
  blindly. Creating a private value writes `http-client.private.env.json`
  atomically with mode `0600`, offers an explicit `.gitignore` rule, rejects
  symlinks/external races, and masks the input. Optional `[Ctrl+K]` persistence
  stores only an opaque `$tuiminal.keychain.*` reference in JSON and resolves the
  real value through Bun's system credential manager.
- The environment manager exposes `[W]` workspace defaults even when no environment
  exists. Non-secret environment, timeout, redirect, header, and history defaults
  persist atomically in `.tuiminal/http/config.json` with mode `0600`. An explicit
  request option always wins; request timeout and redirect controls cycle back to
  inherited state instead of silently baking workspace values into the request.
- `.http` compatibility follows JetBrains units and common syntax: a bare
  `@timeout` value means seconds, serialized values include `ms`, and `//`
  directives, `# @name =`, short GET, and indented multiline URLs are accepted.
  A block containing an unsupported directive, pre-request script, response
  handler, or redirect is read-only and must not be executed or partially
  reserialized as if Tuiminal understood its semantics.

## Free Terminal

- This is a generic Free Terminal, not an AI-only tab. It can host shells and any CLI, including Codex, Claude, database clients, or internal tools.
- Sessions use real Bun PTYs and remain alive across tab switches. Terminal colors, cursor, interactive prompts, and fullscreen TUIs must keep working.
- Give PTYs nearly all available space. Panels are separated with simple lines rather than padded cards.
- A section supports a maximum `2 × 2` layout: at most two horizontal panes and one lower row, with up to four terminals per section. Additional terminals go into another section; the overall session limit is 12.
- `Ctrl+B` is the tmux-style prefix for creating sections, splitting right/down, moving focus, toggling focused/full-section layout, restarting/closing panes, changing sections, and temporarily releasing global tab shortcuts.
- Every split, section, focus, restart, and close control must also be available by mouse. Closing Tuiminal stops only the terminal processes it created.

## Database workspace

- No database is configured by default. The empty Database screen offers connection creation instead of silently connecting through MCP or any developer-specific service.
- Supported connection drivers are MySQL/MariaDB, PostgreSQL, SQLite, and optional MySQL-compatible MCP. MCP is opt-in and read-only; never imply that MCP is the default database path.
- Saved connections can be created, switched, edited, tested, and deleted. Environment URLs may be discovered, but are not persisted as editable saved profiles.
- The connection form is fully keyboard reachable: `[Tab]`/`[Shift+Tab]` traverse drivers, fields, toggles, and actions; `[Ctrl+D]` changes driver, `[Ctrl+T]` TLS, `[Ctrl+K]` keychain, `[Ctrl+W]` access, `[Ctrl+R]` tests, and `[Ctrl+S]` saves. `[Esc]` first blurs an input and only then returns/closes.
- Connection metadata and saved queries live in `~/.config/tuiminal/databases.json` with restricted permissions. Passwords belong in the operating-system credential manager and must never be written to that JSON file, logs, tests, or fixtures.
- SQLite paths must support absolute paths and explicit local files. TLS configuration passed to native clients must use the client's expected boolean/object shape.
- Database write access is opt-in per saved connection. The UI must clearly show read-only versus read/write state.
- The main Database layout has three keyboard-focusable panes: catalog/tree, table/query grid, and the selected-row inspector. Pane focus can change without destroying selection or editor state.
- Keep the main data grid free of redundant title/status chrome: table history or actions begin at the top instead of repeating `schema.table`, driver, and RO/RW. The inactive row inspector does not show navigation hints, and the table-search modal omits explanatory `%text%` copy so both areas give their space to data and controls.
- Horizontal navigation is contextual in Database, with `[H]`/`[L]` as exact aliases for `[←]`/`[→]`: it performs the pane's local horizontal action first, then crosses to the adjacent pane when that direction has no remaining local action. For example, `[L]` or `[→]` moves catalog to grid, both pairs traverse grid columns until an edge, and `[H]` or `[←]` moves inspector back to grid. Text inputs retain their own cursor navigation.
- The catalog groups tables and views by schema in a folder tree. The main view has `[1] Dados`, `[2] Colunas`, `[3] Índices`, and `[4] Schema`; the right inspector shows all values of the selected row vertically. Schema view includes DDL, constraints, indexes, incoming/outgoing foreign keys, their rules, and related tables.
- Table tabs are unique per database connection and keep at most six tables. Reopening a listed table focuses its existing tab instead of adding a duplicate.
- Table-tab navigation uses `[<]` and `[>]` visually and the `<` and `>` keyboard shortcuts. Number keys remain reserved for `[1] Dados`, `[2] Colunas`, and `[3] Índices`.
- The table-history strip is visually separated from `[1] Dados`, `[2] Colunas`, and `[3] Índices`: table tabs sit on a horizontal rule and a second full-width rule closes the strip below them.
- Table history is session-local unless persistence is explicitly added later. Never duplicate `x` in `x → y → x`; select the existing `x` tab.
- Page size adapts to terminal height, horizontal column navigation preserves readable cell widths, and mouse scrolling/selecting works in table and inspector panes. Resizing preserves the absolute selected record instead of clamping selection to a different row.
- Below 100 columns the catalog narrows before starving the grid; database action bars split into two rows, or three below a 42-column data area. Never let controls overwrite borders or neighboring help text.
- Sensitive columns start visible in the grid, inspector, and ad-hoc SQL results. `[V]` explicitly masks them; revealing masked values requires confirmation. The control is red only while values remain masked, and changing visibility must not mutate stored data.
- Sensitive matching uses configurable literal column-name fragments, ignoring case and common separators. Preserve the existing default terms, allow an explicitly empty list to disable automatic masking, and refresh open table/query results after this setting changes.
- `[A]` opens or returns to the SQL workspace and `[Ctrl+A]` executes only the semicolon-delimited statement containing the cursor. Statement detection must ignore delimiters inside quotes, comments, backticks, and PostgreSQL dollar quotes. The textarea has a native, scroll-synchronized line-number gutter plus stable SQL syntax highlighting and autocomplete for keywords, functions, tables, and table columns.
- The SQL workspace supports up to six mounted editor/result tabs. `[Ctrl+N]` creates, `[Ctrl+W]` closes, number buttons select, and `[Alt+←/→]` cycles them. Each tab preserves its own editor, result, error, selection, and layout state when the workspace is hidden or a table is opened; inactive tabs must not intercept keyboard input. Switching database connections may clear tabs to prevent cross-database execution.
- `[Ctrl+↑/↓]` changes the editor/result split in stable increments. `[F10]` maximizes the focused editor or result and restores the split; all layout controls remain mouse-accessible.
- A running editor query exposes `[Ctrl+X] Cancelar`. MySQL/PostgreSQL use the native Bun SQL query handle; SQLite editor queries run in an exact tracked child process because native SQLite execution can block the UI thread. Reuse an idle SQLite query child for nearby executions, expire it after 30 seconds of inactivity, and destroy only the executing child on cancellation. Application shutdown must terminate every child created by Tuiminal and must not leave a CPU-consuming query behind.
- Keep schema inspection lightweight: fetch independent metadata concurrently and avoid per-index/per-table N+1 queries. Leaving the Indexes or Schema view must stop its loading animation so hidden views do not trigger background rerenders.
- A simple single-table `SELECT` reuses the main grid's staged row controls and selected-row inspector. Ambiguous or derived query results remain read-only, and update/delete require every primary-key field in the result.
- `[Esc]` in the SQL editor first unfocuses it. `[Esc]` in the saved-query modal closes only that modal and returns focus to the SQL editor.
- Saved queries are isolated by the saved connection and its actual target, so a query from one database cannot appear in another database.
- `[Ctrl+S]` saves/updates a favorite query and `[Ctrl+F]` opens favorites. Favorites can be loaded and deleted by keyboard or mouse.
- An active favorite shows a dirty indicator when editor SQL differs from the saved query. Favorite timestamps follow the configured UI language rather than the host's default locale.
- Executed SQL history is opened from global settings and records target scope, timestamp, duration, returned/affected row count, and success/error status. Retain only the 100 most recent read-only executions, but retain `INSERT`, `UPDATE`, `DELETE`, DDL, and every other state-changing execution for 184 days (at least six months); the UI must report those two retention classes instead of presenting a misleading global `100/100` limit. `[S]` toggles read-only entries in the history modal without deleting them, and its mouse control switches between `[S] Ocultar SELECT` and `[S] Mostrar SELECT`; when hidden, state-changing history remains visible. Record SQL-editor executions, table rendering/paging/searching, and each approved staged `INSERT`, `UPDATE`, or `DELETE`; exclude internal catalog/schema discovery queries. Staged writes persist a labeled, non-executable parameter preview so placeholders remain understandable; sensitive-column values must always be stored as `<mascarado>`, and raw executable parameters must never be persisted. A sensitive value from a write executed during the current process may remain only in volatile memory: render it as `<mascarada [V]>`, require the normal two-step `[V]` confirmation before revealing it, and fall back to the permanent non-revealable masked form after restart. Rerunning routes back to the original connection; writes must still pass their normal confirmation, and rerun is disabled when that connection no longer resolves to the same target or for every staged grid write, which must be reviewed again from the grid.
- In the data grid, `[F]` cycles the selected column through normal, ascending, and descending order. `[S]` opens a compact table-wide search input; it performs a case-insensitive `%text%` match across every column. Search and sort state are session-local and isolated per connection/table. `[Enter]` applies search, `[Ctrl+L]` clears it, and `[Esc]` follows the normal input focus stack.
- Database writes remain staged until the user reviews and explicitly applies them. Cell edits are orange, pending deletions are red, and new rows are blue.
- Editing works from the grid and row inspector. `[Enter]`/`[E]` edits, `[dd]` stages deletion, `[Ctrl+A]` stages a new row, `[U]` undoes a staged row change, and `[Ctrl+S]` opens review.
- Main-table and editable SQL-result grids support multi-row selection. `[Space]` toggles the current row, `[Ctrl+Space]` toggles the visible page, mouse-accessible `○`/`●` gutter controls mirror both actions, and `[Esc]` clears selection before leaving the screen. Main-table selections persist by connection/table across pagination; query-result selections are local to their mounted SQL tab and reset with a new result.
- With rows selected, `[E]` stages the selected-column value for every identified row, `[dd]` stages per-primary-key deletes, `[U]` undoes staged changes for the selected set, and `[X]` opens CSV/TSV/JSON copy/export. Rows without a primary key remain selectable/exportable but batch writes are blocked. Keep one review item per row and apply approved items through the existing single native transaction.
- Batch exports contain only the current result columns, copy through OSC52, and save protected files under `tuiminal-exports/` in the launch directory. Clear selection immediately when sensitive-data visibility changes so stale revealed snapshots cannot be exported.
- Cell editor values are coerced and validated from schema types for integers, decimals, booleans, and JSON; textual types remain strings.
- Applying staged changes shows the exact SQL operations and requires a second approval. Approved changes are isolated by connection and execute in one native transaction; any failure rolls the complete approved batch back.

## Known next product priorities

- CSV/TSV/JSON import with mapping and staged validation.
- Trigger inspection and optional visual relationship navigation from the schema view.
- Favorite-query “Save as”, rename, and optional organization; table-history clearing and optional persistence.

## Validation

- Use Bun 1.3.14 from `.bun-version`. Install with `bun install --frozen-lockfile`. `bun run typecheck` explicitly uses the native TypeScript 7 compiler; the TypeScript 6 dev dependency is the AST API required by dependency-cruiser, not the production runtime or primary compiler.
- Architecture is a modular monolith, not the future plugin SDK. See `docs/architecture.md` and `docs/adr/0001-modular-monolith.md`. `app` may import features only via their public `index.ts`; features must not import one another or `app`; `core`/`shared` must not import features/app. Model modules must not import UI, IO or service modules, including type-only dependencies. Do not add barrels that reintroduce cycles.
- Initialize UI settings explicitly at CLI/bootstrap boundaries, before dynamically importing feature components that capture syntax styles. Merely importing `theme.ts` must not load user settings or set global language/sensitive-data state.
- Pure transitions belong in feature models. Use small reducers for related state (Runner log preferences are the initial example), and use callbacks/contracts to connect tools through the app. Keep native refs and process lifetimes stable during extraction; a giant catch-all hook is not an acceptable decomposition.
- `bun run format` applies Biome formatting. `bun run check:architecture` must analyze every source module and fail closed on incomplete analysis. `bun run check:maintainability` enforces the reviewed baseline: new files normally stay within 400 lines and functions within cognitive complexity 20; existing debt cannot grow past its recorded budget. Baseline changes require a written reason and review, not automatic regeneration to make checks pass.
- `bunfig.toml` preloads `tests/setup.ts` to isolate even plain `bun test`. TUI tests reuse that same Runner fixture so cached service constants and mounted UI agree on the launch directory. Keep production credentials, real user sessions and foreign processes out of all test fixtures.

- Automated tests are part of the project workflow from now on. Every bug fix must add a regression test whenever the behavior can be automated, and every new or changed logic path must add or update its unit/integration coverage.
- `bun run check` is the required handoff gate and must run typechecking, lint, and the complete automated test suite. Also verify `git diff --check` when the environment permits it.
- `bun run test:database:drivers` is the opt-in heavy database matrix. It starts isolated MySQL, MariaDB, and PostgreSQL Docker containers on random loopback ports, exercises catalog/data/schema/write/cancellation behavior, and removes only those exact containers. Keep it out of the normal offline gate and never embed durable test passwords.
- Keep tests deterministic and isolated. Use temporary directories, local ephemeral servers, and disposable databases; never read or mutate the user's real config, credentials, database, network services, or unrelated processes.
- Do not delete, skip, weaken, or over-mock a meaningful assertion just to make the suite pass. Fix the implementation or document a genuine environment limitation.
- For interactive regressions, launch an isolated Tuiminal instance with a temporary `XDG_CONFIG_HOME` and the demo SQLite database. Stop only that exact test session afterward.
- When changing focus, modal, mouse behavior, terminal input, or keyboard propagation, test the real TUI sequence in addition to the automated regression test whenever the behavior is automatable.
