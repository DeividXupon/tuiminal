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
- The public README keeps one animated demo for each top-level tool under `docs/media/`. Regenerate them with `bun run docs:demos` after material layout or workflow changes. The generator must use simulated data or disposable local fixtures, never user credentials, repositories, databases, network services, or persistent configuration.
- Keep existing user work intact. The worktree may contain intentional uncommitted changes from ongoing development.
- Do not commit, push, publish, change repository visibility, or kill user processes unless the user explicitly requests that action.

## Global navigation and CLI

- Global tabs use `[Alt+1]` Database, `[Alt+2]` Git, `[Alt+3]` Runner, `[Alt+4]` HTTP, and `[Alt+5]` Free Terminal. Accept both OpenTUI `meta` and `option` modifier fields, keep Kitty `allKeysAsEscapes` enabled for supporting terminals, and retain the traditional escape-prefixed Alt fallback. Plain number keys remain available for local actions inside tools. Runner is the default screen for normal CLI and development startup; unknown or removed tool IDs must fall back to it, not mount an empty panel.
- `[,]` opens global settings. All top-level tabs, buttons, lists, fields, commits, diffs, and scrollable areas should remain usable with the mouse.
- The CLI accepts an optional project directory and isolated-tool subcommands. Supported aliases include `banco`/`database`/`db`, `git`, `runner`/`run`, `http`, and `terminal`/`term`/`tty`.
- `tuiminal <tool> [directory]` mounts only the requested tool. Do not initialize hidden tools or their processes in isolated mode.
- The global CLI entry is `bin/tuiminal.ts` and runs directly through Bun; source changes do not require a separate compilation step. After local global-link testing, ensure `~/.bun/bin/tuiminal` still targets this entrypoint.

## UI and interaction conventions

- Every visible keyboard activation must be enclosed in brackets. Use `[Esc]`, `[Enter]`, `[Ctrl+S]`, `[↑/↓]`, and `[E/Enter]`; never show bare shortcut names in help text or action labels.
- The TUIMINAL wordmark and bracketed keyboard hints share the fixed brand accent `#4B75FF` across palettes. Use `ShortcutText` for UI hints (`InlineButton` already uses it); only key tokens change color, while labels retain their semantic/focus colors. Never apply hint styling to logs, SQL, commands, PTY output or arbitrary user data. Use `highlight={false}` for data branches of mixed hint/data text.
- Real interactive launches begin with a short responsive brand animation: the four `#4B75FF` logo blocks fall and settle one at a time from the lower-right block upward, with the top bar landing last, then the Tuiminal wordmark appears. Keep tools unmounted until it completes, allow `[Enter]`/`[Esc]` or a mouse click to skip it, and use the compact mark on constrained terminals. Headless HTTP commands never mount it; automated workspace tests may explicitly bypass it.
- Keyboard actions exposed in the interface should also have a mouse-accessible control whenever practical.
- `[Esc]` closes only the topmost active layer. A modal must consume the event with `preventDefault()` and `stopPropagation()` and must not allow the same keypress to close its parent screen or the application.
- Application-level Database exit on `[Esc]` must wait for local workspace handlers to consume the event. Grid/query batch selection uses `[Esc]` to clear itself even when no modal input owns focus; never quit synchronously before checking `defaultPrevented`.
- Any focusable modal control must be recognized by its feature's `keyboard.ts` scope, consumed by the application-level guard in `src/app/App.tsx`, including empty modal states where the dialog itself receives focus. Preserve local Escape handling and event consumption.
- Do not mount closed modal components that subscribe through `useKeyboard` or `useTerminalDimensions`. Render them only while open so hidden tools and dialogs do not accumulate global OpenTUI listeners; mounted inactive SQL tabs are the deliberate exception because their editor/result state must survive tab switches.
- OpenTUI adds one renderer `selection` listener per mounted scrollbox. Workspaces that intentionally retain several editor trees, such as HTTP's six documents, must configure a bounded renderer listener budget derived from their documented limits; keep separate regressions for leak-sensitive `resize` and `keypress` listener counts.
- Text inputs follow a focus stack: `[Esc]` first dismisses autocomplete or unfocuses the active input, a later `[Esc]` closes its containing screen, and only the final global action may exit the app.
- Never let global shortcuts fire while a text input, SQL editor, terminal, picker, or modal owns the keyboard.
- Both layout modes are first-class: `framed` uses gaps and full borders; `compact` removes gaps and full panel borders, separates panels through subtle background differences, and gives the focused workspace panel a single left rail in that tool's accent color. Inactive compact panels do not gain a focus rail.
- Settings are contextual. In the Database tab or isolated Database mode, `CONFIGURAÇÕES DO BANCO` appears first and contains sensitive-data terms and SQL history, followed by `CONFIGURAÇÕES GLOBAIS`. In every other tool, hide both Database sections entirely and show only the global divider with palette, layout, language, and tutorial. Keyboard section cycling must use this same visible order and never focus a hidden section. Keep a one-row vertical gap between option groups, scroll whole section groups into view, and keep viewport culling disabled in this short list; culling causes partially redrawn rows when navigating back upward in OpenTUI.
- Avoid decorative boxes around every element. Prefer simple `─` and `│` separators where maximizing content space matters.
- Animations and appearance changes must not remount inputs, reset focus, or make syntax highlighting flicker. Keep editor/renderable refs stable and update highlights in place. In particular, never key a mounted `Tabs.List` or its tab tree by palette, language, or layout: tuiparts requires each live tab value to stay unique while React reconciles the update.
- Full-panel loading states use the shared animated ASCII plasma surface behind a readable status card and dissolve in place over roughly 220 ms when content becomes ready. Keep the normal panel mounted under the transition so content does not jump. Render the plasma as one bounded styled text document at a capped frame rate, never as one React node per cell. Incremental pagination and background refreshes stay inline and must not cover content that is already usable.
- Keep selected/focused states obvious through accent color and background, not only through a subtle border.
- Relevant information, success, warning, and error events from every top-level tool use the shared floating notification center. Keep at most three cards, show only the newest cards when height is constrained, auto-dismiss transient states, and keep errors until the user dismisses them with the mouse-accessible `×` control. Notifications must not steal keyboard focus or own `[Esc]`; retain local inline feedback when it provides useful context.
- In compact layout, inactive inline controls inherit the surrounding panel instead of painting `panel` rectangles. Active Database cells and inspector fields use the palette's dark `databaseSelectionBg` with normal text; reserve the bright database accent as a solid selection background for framed layout so 256-color terminals keep states distinct.

## Appearance, language, and tutorial

- Settings persist in `~/.config/tuiminal/settings.json`. Color mode defaults to dark and can switch independently to light; both modes support the Prime, Midnight, Nord, Gruvbox, Dracula, Catppuccin, and Tokyo Night palettes. Current layouts are framed and compact. The same file stores the user-configurable sensitive column-name terms.
- Supported UI languages are Brazilian Portuguese, English, Spanish, Japanese, Simplified Chinese, and Korean.
- All fixed user-facing text must go through `translateUi` and have an entry or pattern in `src/shared/i18n/index.ts`. Changing language must update the complete interface, not only navigation labels.
- Unicode width and truncation must remain grapheme-aware so Asian text does not break borders or alignment.
- The tutorial is a settings option. Its floating card is anchored to the item being explained, resizes/repositions between steps, highlights the current target, and dims unrelated areas.
- Keep each tour focused on the active tool; do not add global navigation or settings steps. Every tutorial target and every translation entry must have regression coverage so stale anchors are caught before release.
- Keep the transparent mouse hit area over the current tutorial target paintless. Giving that overlay even a nearly transparent background erases wide Asian glyphs in OpenTUI; the surrounding dim regions provide the visual treatment.
- The Database tutorial uses simulated hardcoded catalog, table, row, and write-state data so every step remains demonstrable without a configured database. Do not access a real database from tutorial mode.
- The Database demo must cover table history, sort/search, batch row/page selection, export, staged single/batch writes, review, the row inspector, and pagination. Selected demo rows use the same `○`/`●` gutter language as the real grid.

## Git workspace

- `GIT_PR_PLAN.md` / `docs/design/git-pr-interface.md`, `GIT_ISSUES_PLAN.md` / `docs/design/git-issues-interface.md`, and `GIT_INBOX_PLAN.md` / `docs/design/git-inbox-interface.md` specify the completed `[1] Diffs` / `[2] PR` / `[3] Issues` / `[4] Inbox` workspace inspired by gh-dash. Preserve Diffs as the offline local Git workspace; keep PR, Issues, and Inbox responsibilities in separate models/services/UI and retain fake `gh`/fixture coverage for every remote read or write. Review the relevant documents before changing navigation, capabilities, safety, limits or persistence, and update their evidence when behavior changes.
- Remote PR, Issue, and Inbox lists automatically request the next page when selection reaches the final loaded row and render the loading state inside the list. Their configured refresh interval reloads every configured section and reconstructs the same page depth reached in the current session. Background refresh must preserve the visible data on failure and must not race a page request.
- PR and Issue scope summaries show the exact `owner/repository` when only one remote repository is selected; use a numeric repository count only for multi-repository selections. Inbox refresh is always automatic and should show refresh copy only while an update is actually in progress.
- PR and Issue query editors share GitHub qualifier autocomplete. `[Ctrl+N/P]` moves through contextual suggestions and `[Ctrl+Y]` applies one; profile repositories appear as `repo:` completions. Keep the query itself authoritative and continue applying the structured account/repository scope separately.
- New GitHub profiles start with exactly three English selectors across the two query lists: PR has `My PRs` and `Review requested`, while Issues has `My Issues`. When loading configuration, migrate only the exact untouched legacy default sets; never replace selectors the user customized.
- Inbox uses the authenticated host from the project PR profile but remains a separate REST-backed session and UI. Its default sections are Inbox, review requested, assigned, mentioned, and locally saved. Mark-read is explicit; done and unsubscribe require confirmation. Persist only saved thread IDs in `~/.config/tuiminal/git-inbox.json`, atomically with mode `0600`.
- PR and Issue searches require no initial setup. Without an explicit project profile, a launch inside a Git repository with a parseable GitHub `origin` defaults both tools to that repository; a launch outside Git, or without a parseable GitHub remote, defaults to the complete authenticated account scope. A broad account query is scoped with `user:<viewer>`, `org:<membership>`, and external `repo:<owner/name>` qualifiers so it never becomes an accidental GitHub-wide search. An explicitly saved empty repository list means `TODOS`/account scope.
- Issue searches use the same account-scope rule, always add `is:issue` and `archived:false`, and reject `is:pr`. The dense two-line list and Overview/Activity preview support configurable sections, columns, sort and limits; wide, medium and narrow terminals use side-by-side, stacked and one-pane layouts respectively.
- Issue writes cover comment, assign/unassign, label deltas, `gh issue develop --checkout`, close and reopen. Keep the prepare/re-authenticate/re-read/execute-once/reconcile flow; pin host, node ID, repository, number, state, `updatedAt` and auth generation. Timeout/cancellation after dispatch remains uncertain with no retry. Label and assignee edits must use complete details rather than search summaries, and checkout must pass the existing clone/remote/clean-worktree checks.
- Git configuration is contextual: only the Git screen exposes it through global `[,]` settings. Its unified modal owns the local Diffs target, PR selectors, Issue selectors, and one remote repository scope saved to both profiles; the repository tab lists `TODOS` plus every accessible owned, organization, and direct-collaborator repository. `[Ctrl+P]` in Diffs opens that modal directly on the local target, where the user may choose an existing local Git repository and one of its local branches. Persist the selected Diffs repository separately in `~/.config/tuiminal/git-diffs.json`; changing it or checking out its branch must not alter or refresh the remote PR/Issue/Inbox scope. Do not restore local `[Ctrl+E]`, `[S]`, or `[+]` configuration shortcuts in PR/Issues; `[/]` remains the quick editor for the active query.
- Issue configuration lives in `~/.config/tuiminal/git-issues.yaml`, atomically written with mode `0600` and scoped by canonical project root. An empty repository list means account scope. Diffs, PR, Issues, and Inbox preserve independent state; shutting down Git must dispose all remote resource groups.
- Git Diffs behaves like a compact lazygit-style workspace for the selected local repository. It initially uses the repository from which Tuiminal was launched, but may switch independently to another repository and branch available on the machine.
- The first Git tab visibly pairs `[1]` with `[C] Git · Diffs`; `[C]` toggles the same tab to `Git · Compare`. Compare reuses the selected local project and accepts local plus already-known remote refs. Once all selectors are applied, wide layouts place project, base, arrow, and compared cards in one row; narrower layouts stack all three. The result has a folder-grouped file tree and renders only the selected file, with `[Tab]`, `[H/L]`, and `[←/→]` switching tree/diff focus and a fixed shortcut footer that must remain visible above scrollable content. It uses the PR-style `base...compared` range, never checks out either ref, excludes uncommitted worktree changes, and returns to Diffs with `[C]` or `[Esc]`.
- The changed-file tree is grouped into real folders and distinguishes staged and unstaged changes. File rows show only Git's two-character status code, with semantic colors per character; do not add redundant circle/question markers. Folder disclosure and names use colors distinct from files. Staging one file or all files must refresh the view without losing useful selection context.
- In Diffs, `[Tab]`, `[H/L]`, and `[←/→]` move focus between the file tree and preview, and the focused framed panel uses the Git accent border. The file tree, Log, and full Git graph use `[J/K]` and `[↑/↓]` only while their own panel is focused; do not use `[N/P]` for local history. `[O]` opens Log, and `[V]` visibly identifies and cycles the diff layout. Keep the fixed shortcut footer mounted above scrollable content even during refreshes, actions, messages, and errors.
- A small commit graph remains visible under the file tree; fullscreen graph mode replaces the code/diff area. Graph rows show short hash and author initials. Size and bottom-align the mini graph from the rendered file-panel bounds, including its current compact focus rail, rather than estimating from the terminal dimensions; keep its horizontal inset symmetric in both framed and compact layouts when focus changes.
- Commit lanes need distinct, stable colors and clean Unicode connectors similar to lazygit. Do not render every branch/lane in the same color.
- Diff modes include unified, side-by-side, and intraline. Intraline mode represents a modified line once and highlights only the changed characters, rather than always showing separate full `-` and `+` lines. Its code cell must shrink beside the line-number gutter; never give both the gutter and code a combined width wider than the pane.
- Diffs show old/new line numbers, syntax highlighting, hunk context, additions/removals, and should remain visually stable without highlight flicker. Preserve the mounted diff while the next selected file loads, and do not feed preview-loading animation frames into the repository/branch header.
- Commit history supports author/date/statistics and opening a commit diff. Keyboard and mouse navigation must work in files, commits, graph, and diff views.

## Runner and long-running processes

- Runner detects commands for JavaScript package managers, Composer/PHP, Laravel, Symfony, Python/Django, Go, Rust, Ruby/Rails, Maven, Gradle, .NET, Deno, Taskfile, Makefile, justfile, and Docker Compose. A manual command input is always available as fallback. Treat its content as the literal command: once non-empty, show a highlighted `Save command [Ctrl+S]` action beside the input flow. Saving opens a modal that collects the display name and an explicit PTY choice; PTY is off by default and the modal explains that it is intended for shells, REPLs, menus, and programs that request input rather than ordinary log-only scripts or servers.
- Long-running commands are process sessions, not one-shot log entries. Selecting an already running command opens its existing process; it must not execute again. A separate `[R]` action explicitly starts another instance.
- `PROCESSOS ATIVOS` and discovered listening ports live directly below detected commands. Display useful URLs such as `127.0.0.1:8000` and associate ports with their owning process/project.
- The last Runner action, `[+]`, opens another project; pressing `+` opens the same picker from any Runner pane, including multi view and the empty-project state. Text inputs and modals retain their own keyboard handling. It searches Git repositories, filters by name/path, and provides a filesystem picker. Processes remain alive when switching projects.
- Runner project tabs use local number shortcuts `[1]`–`[4]`; global tool switching requires `[Alt+1]`–`[Alt+5]`.
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
- Runner stop first sends `SIGTERM` to the process group it created and escalates to `SIGKILL` after a one-second grace period if the group does not exit. Clear the escalation timer on exit; this bounded fallback is what turns the UI from `stopping` into a completed state for commands such as `bun run dev` that ignore graceful termination.

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
- HTTP execution carries a non-serializable privacy context through preparation, redirects, responses, chained requests, failures and history. Retain known values across scope changes and learn sensitive headers/cookies plus newly extracted private values before building history/reports. Mask known values and common URL/form/JSON encodings in all history metadata and assertion diagnostics; never mutate the active raw response. Even with body persistence enabled, executions with known secrets keep bodies only in the bounded session cache. Public bodies remain a separate opt-in and may still contain unrecognized private data; do not promise arbitrary-body sanitization. Existing history/backups are not automatically scrubbed. Explicit response export remains a separate user action.
- HTTP origin changes remove authentication headers by provenance, sensitivity and known private value, not just a fixed name list. Cookie credential provenance must survive every hop: a later same-origin redirect must not reattach a cookie stripped at an earlier crossing, while independently issued destination cookies remain usable. Pause the existing transport for approval before forwarding any retained body/private URL cross-origin, downgrading HTTPS to HTTP or using unapproved insecure TLS. `[Y]` approves only that redirect; TLS-only prompts retain `[I]` session/target/environment approval. `[Esc]`, timeout, abort and unmount reject pending work without replaying earlier requests or dependencies. The mounted modal owns keyboard events through `useKeyboard` (OpenTUI key events do not bubble from focused children); reject repeated approval events and stale queue IDs. The queue is bounded to 16 and tolerates React effect teardown/setup. Headless runs require exact-origin `--allow-private-redirect-to` and/or `--allow-http-redirect-to`; neither implies `--allow-insecure-tls`, and approval never restores removed source headers. Reject redirect URL credentials/non-HTTP protocols. Native PTY regressions run separately with `TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts` on supported POSIX hosts.
- Closing a redirect approval restores its previous live, visible control without stealing focus from a newer layer. In a collection, `[Esc]` first rejects the redirect, the next press blurs the restored dataset input, and the following press closes the collection; the application must remain open through those steps.
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
- Request Options exposes `[C]` to include or ignore the cookie jar per request.
  Ignoring it must suppress both cookie reads and `Set-Cookie` writes, appear in
  Preview, and round-trip through the interoperable `# @no-cookie-jar` directive.
- Request Options accepts an explicit HTTP/HTTPS proxy and uses `[V]` for TLS
  verification. Proxy credentials must come from private variables and remain
  redacted in previews, conflicts, cURL, reports, and transport errors. Insecure
  TLS is opt-in per request, appears literally in red, and requires `[I]` approval
  scoped to target, selected environment, and the current session; every new
  HTTPS redirect target requires its own approval. Headless runs require the
  explicit `--allow-insecure-tls` flag.
- `[E]` opens the HTTP environment manager; it no longer cycles environments
  blindly. Creating a private value writes `http-client.private.env.json`
  atomically with mode `0600`, offers an explicit `.gitignore` rule, rejects
  symlinks/external races, and masks the input. Optional `[Ctrl+K]` persistence
  stores only an opaque `$tuiminal.keychain.*` reference in JSON and resolves the
  real value through Bun's system credential manager.
- Resolve the selected HTTP environment name independently for each saved request,
  from its `.http` directory toward the project root. The nearest directory that
  defines the name wins as a whole; private values override public values only
  within that same directory, and sibling-only environments never leak across
  services. Scratch uses the root scope. Create private values beside the active
  `.http` file and show that destination before saving.
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
  reserialized as if Tuiminal understood its semantics. Open these blocks in a
  scrollable raw pane containing the exact original block; do not leave the visual
  builder or editable omnibar active for them. Keep the versioned compatibility
  matrix under `tests/fixtures/http/` aligned with the JetBrains syntax boundary.
- Keep narrow HTTP panes clipped to their bounds. At low heights, compress the
  local `Mais` tab strip to one row, keep Options scrollable, and put its execution
  controls before metadata so keyboard and mouse actions remain reachable.
- Keep large HTTP responses bounded twice: capture at 1.5 MB, then render at most
  50,000 characters in the live pane as one native text document. Show
  `TRUNCADO` in fixed response chrome; saving preserves all captured bytes and a
  safe full GET download remains a separate action.
- The HTTP request/response split starts at equal 50/50 sizing in every simultaneous-pane layout and has both `[Ctrl+↑/↓]` buttons and a real mouse
  drag handle. Both routes update the same per-document ratio and keep it between
  25% and 70% across horizontal and vertical responsive compositions.
- The HTTP tutorial uses a simulated local workspace and response, with no
  project scan or network access. Keep stable targets for documents, omnibar,
  collection, request builder, automation/security, and response inspection, and
  cover every target and translation in regression tests.
- Postman v2.1 and OpenAPI 3.0/3.1 import compatibility is recorded under
  `tests/fixtures/http/import/`. OpenAPI local `$ref`, parameter overrides, and
  root/path/operation servers are supported; external refs and lossy constructs
  must be reported without exposing their URLs or contents. Imported literal
  secrets use unique private-variable placeholders per request and field.

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
- The catalog list flexes to the rendered sidebar height. Table page size uses every terminal row left after the documented Database chrome, without a fixed row cap; horizontal column navigation preserves readable cell widths, and mouse scrolling/selecting works in table and inspector panes. Resizing preserves the absolute selected record instead of clamping selection to a different row.
- Database plasma loader insets must match the visible table-history, view/action, and pagination rows so the absolute overlay covers only the dynamic catalog/table/query body and never obscures usable chrome.
- Below 100 columns the catalog narrows before starving the grid; database action bars split into two rows, or three below a 42-column data area. Never let controls overwrite borders or neighboring help text.
- Sensitive columns start visible in the grid, inspector, and ad-hoc SQL results. `[V]` explicitly masks them; revealing masked values requires confirmation. The control is red only while values remain masked, and changing visibility must not mutate stored data.
- Sensitive matching uses configurable literal column-name fragments, ignoring case and common separators. Preserve the existing default terms, allow an explicitly empty list to disable automatic masking, and refresh open table/query results after this setting changes.
- `[A]` opens or returns to the SQL workspace and `[Ctrl+A]` executes only the semicolon-delimited statement containing the cursor. Statement detection must ignore delimiters inside quotes, comments, backticks, and PostgreSQL dollar quotes. The textarea has a native, scroll-synchronized line-number gutter plus stable SQL syntax highlighting and autocomplete for keywords, functions, tables, and table columns.
- The SQL workspace supports up to six mounted editor/result tabs. `[Ctrl+N]` creates, `[Ctrl+W]` closes, number buttons select, and `[Alt+←/→]` cycles them. Each tab preserves its own editor, result, error, selection, and layout state when the workspace is hidden or a table is opened; inactive tabs must not intercept keyboard input. Switching database connections may clear tabs to prevent cross-database execution.
- `[Ctrl+↑/↓]` changes the editor/result split in stable increments. `[F10]` maximizes the focused editor or result and restores the split; all layout controls remain mouse-accessible.
- A running editor query exposes `[Ctrl+X] Cancelar`. MySQL/PostgreSQL use the native Bun SQL query handle; SQLite editor queries run in an exact tracked child process because native SQLite execution can block the UI thread. Reuse an idle SQLite query child for nearby executions, expire it after 30 seconds of inactivity, and destroy only the executing child on cancellation. Application shutdown must terminate every child created by Tuiminal and must not leave a CPU-consuming query behind.
- Keep schema inspection lightweight: fetch independent metadata concurrently and avoid per-index/per-table N+1 queries. Leaving the Indexes or Schema view must stop its loading animation so hidden views do not trigger background rerenders.
- A simple single-table `SELECT` reuses the main grid's staged row controls and selected-row inspector. Ambiguous or derived query results remain read-only, and update/delete require every primary-key field in the result.
- Editable SQL results require a dialect-aware, direct, unique projection from one unambiguous catalog relation. Expressions, renamed/duplicate fields, mixed wildcards, executable comments, unknown syntax, and mismatched result/schema fields must fail closed for single-row, batch, and insert controls. A result column label alone never proves provenance.
- Run native PostgreSQL reads in a pinned `READ ONLY` transaction. MySQL/MariaDB additionally need a session-level READ ONLY default on that same connection because DDL implicitly commits transactions; restore the exact prior default before reuse and invalidate/close the pool if restoration fails. SQLite editor reads use a readonly handle, including reads on RW profiles. Classify unknown routines, state-changing PRAGMAs, executable comments and effectful EXPLAIN as requiring RW and confirmation. The app is not a sandbox for server routines; use least-privilege credentials and require the optional MCP server to enforce read-only access.
- SQL result row navigation must compute scroll position from the selected row and the rendered viewport so the first and last records remain reachable. While the grid is focused, `[J/K]` and `[↑/↓]` move the active row; the scrollbox only follows that selection and must not consume those keys as free scrolling. At the first result column, `[H/←]` returns to the catalog and hides the query workspace without discarding its mounted tab state; `[A]` reopens it.
- `[Esc]` in the SQL editor first unfocuses it. `[Esc]` in the saved-query modal closes only that modal and returns focus to the SQL editor.
- Saved queries are isolated by the saved connection and its actual target, so a query from one database cannot appear in another database.
- `[Ctrl+S]` saves/updates a favorite query and `[Ctrl+F]` opens favorites. Favorites can be loaded and deleted by keyboard or mouse.
- An active favorite shows a dirty indicator when editor SQL differs from the saved query. Favorite timestamps follow the configured UI language rather than the host's default locale.
- Executed SQL history opens from Database settings and persists only target, timestamp, command class, read/write classification, duration, counts and success/error metadata for new executions. Raw SQL, server diagnostics and all parameter values stay in a volatile cache bounded to 200 entries and 2 MB of UTF-8 JSON; cache eviction or shutdown leaves non-rerunnable metadata, never executable redacted SQL. Retain metadata for the latest 100 reads and 184 days of writes. `[S]` hides/shows reads without deleting them. In-session staged parameters remain labeled, sensitive fields use the two-step `[V]` reveal, and staged changes cannot rerun from history. Ad-hoc in-session reruns must resolve the same original connection/target and require normal write confirmation. Record editor/table-page/search/staged executions, not catalog discovery. Preserve legacy content on load; `[D]` opens and `[Y]` separately confirms irreversible cleanup of old SQL/parameters/errors while retaining metadata and favorites, and `[Esc]` cancels that confirmation first. Ignore repeat events on approval and explain that backups are not erased. Favorites are a separate explicit action that still saves full SQL; never imply they are metadata-only.
- In the data grid, `[F]` cycles the selected column through normal, ascending, and descending order. `[S]` opens a compact table-wide search input; it performs a case-insensitive `%text%` match across every column. Search and sort state are session-local and isolated per connection/table. `[Enter]` applies search, `[Ctrl+L]` clears it, and `[Esc]` follows the normal input focus stack.
- Database writes remain staged until the user reviews and explicitly applies them. Cell edits are orange, pending deletions are red, and new rows are blue.
- Editing works from the grid and row inspector. `[Enter]`/`[E]` edits, `[dd]` stages deletion, `[Ctrl+A]` stages a new row, `[U]` undoes a staged row change, and `[Ctrl+S]` opens review.
- Main-table and editable SQL-result grids support multi-row selection. `[Space]` toggles the current row; `[Alt+Space]` anchors a contiguous range that `[↑/↓]` expands or shrinks between the anchor and current row, replacing the active selection like an Excel range. Do not assign a distinct action to `[Shift+Space]`: legacy terminal input commonly reports it as plain Space. Mouse-accessible `○`/`●` row gutters and the `◇`/`◆` range control mirror both actions, and `[Esc]` clears the selection and range mode before leaving the screen. Never restore visible-page select-all. Main-table selections persist by connection/table across pagination, but changing pages ends active range mode; query-result selections are local to their mounted SQL tab and reset with a new result.
- With rows selected, `[E]` stages the selected-column value for every identified row, `[dd]` stages per-primary-key deletes, `[U]` undoes staged changes for the selected set, and `[X]` opens CSV/TSV/JSON copy/export. Rows without a primary key remain selectable/exportable but batch writes are blocked. Keep one review item per row and apply approved items through the existing single native transaction.
- Batch exports contain only the current result columns, copy through OSC52, and save protected files under `tuiminal-exports/` in the launch directory. Clear selection immediately when sensitive-data visibility changes so stale revealed snapshots cannot be exported.
- Cell editor values are coerced and validated from schema types for integers, decimals, booleans, and JSON; textual types remain strings.
- Applying staged changes shows the exact SQL operations and requires a second approval. Approved changes are isolated by connection and execute in one native transaction; any failure rolls the complete approved batch back.

## Known next product priorities

- CSV/TSV/JSON import with mapping and staged validation.
- Trigger inspection and optional visual relationship navigation from the schema view.
- Favorite-query “Save as”, rename, and optional organization; table-history clearing and optional persistence.

## Validation

- Release-readiness reviews must distinguish the source checkout, the remote tag, and the actual installed npm artifacts. Record the exact SHA, executed platform/driver matrix, skipped checks, and unresolved risks; a green source-only gate is not a security certification or proof that every advertised binary works. Keep proposed fixes and release approval separate from an analysis-only task.
- Public releases use SemVer prereleases and keep the root development package private. `bun run build:release` creates ignored artifacts under `dist/npm`: a Node launcher package named `tuiminal` plus one public `@xupon/tuiminal-<platform>-<arch>` package for each macOS, Linux glibc, and Windows x64/ARM64 target. The platform package contains adjacent compiled `tuiminal` and `tuiminal-sqlite-query` executables so end users need Node/npm for installation but do not need Bun. Publish prereleases with the npm `pre-alpha` dist-tag and mark the matching GitHub release as a prerelease; never publish the private repository root directly.
- The repository and every generated npm package use Apache-2.0. Keep the canonical root `LICENSE`, the package manifests, release packaging, README, and contribution terms aligned; generated packages must carry their own copy of `LICENSE`.
- The source CLI may continue reading package metadata through a bundled JSON import. SQLite query sessions must prefer the compiled helper beside `process.execPath` and fall back to the TypeScript child under the Bun source runtime. Test the host binary, the helper IPC path, package contents, and a clean npm installation before publishing each release.
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
