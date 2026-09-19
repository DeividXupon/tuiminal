# HTTP client evolution plan

> Status: living technical plan and implementation record. Phases describe the
> target direction; the progress section distinguishes work supported by checkout
> evidence from work still requiring implementation or validation.
>
> Reference research was conducted on 2026-09-05. Read proposals alongside progress
> below, rather than treating every proposed item as an outstanding task.
>
> The rebuild replaced the previous HTTP implementation. Current behavior and
> invariants are documented in the [README](./README.md) and [AGENTS.md](./AGENTS.md);
> module organization is in [docs/architecture.md](./docs/architecture.md).
>
> File compatibility remains documented in
> [tests/fixtures/http/README.md](./tests/fixtures/http/README.md).

### Release readiness

Completing functional phases does not approve a release. The
[alpha checklist](./ALPHA_READINESS_PLAN.md) separates local privacy, redirect,
cookie, filesystem, and limit fixes from outstanding acceptance on packaged target
systems. Consult it before qualifying a candidate; local tests alone do not establish
security.

## Executive overview

The rebuild takes HTTP from individual calls with session history to an integrated
API workspace. The direction combines:

- Posting's hierarchy: persistent URL, side collection, simultaneous request/response,
  clear focus, dense tabs, and contextual help.
- Restless's project model: readable, versionable `.http` files useful outside the TUI.
- ATAC's coverage as a long-term reference, without immediately copying its broad
  set of protocols, authentication modes, and states.
- post-tui's onboarding clarity, while addressing its editing, responsiveness,
  cancellation, security, and testing limitations.

The product direction is **Posting-inspired interaction, one global interactive HTTP home,
bounded and cancellable execution with protective defaults, and a coherent part
of Tuiminal**.

The initial sequence starts with domain contracts, layout resolution, execution
ownership, bounded/cancellable transport, and new composition. Collections,
environments, advanced inspection, and automation build on that foundation;
OpenAPI, scripts, and WebSocket do not come first.

## Implementation status

- **Phase 0 — implemented with targeted regression coverage:** new domain, layout,
  transport, storage, and UI modules replace the old implementation. Ownership,
  cancellation, timeout, bounded capture, and `[Esc]` propagation have regressions.
- **Phase 1 — complete within current scope:** four responsive modes, builder/response,
  six document tabs, split, maximization, jump mode, Params/Headers/Body/Auth/More,
  and custom methods are connected. Prepared-request preview shows provenance and
  masks secrets; application exit with HTTP drafts requires confirmation. An
  automated matrix covers `60×16`, `72×18`, `80×24`, `96×24`, `120×30`, and `160×40`
  in framed/compact layouts and six languages, including long URLs/CJK, six tabs,
  control bounds, and resize without remount. Real PTY sessions confirmed both
  layouts at all six dimensions, resize during editing, `[Esc]` sequences, actual
  divider drag, and Japanese CJK alignment in WezTerm/WSL2 and tmux.
- **Phase 2 — complete within current scope:** scanner/watcher, `.http` parser and
  serializer, files, global interactive environments, cURL, multipart, and file
  bodies exist. External conflicts show a redacted diff with explicit reload,
  overwrite-with-local, or save-copy choices. The environment manager writes private
  values in the operating system credential store and writes only opaque references
  to `0600` files. Interactive HTTP ignores the former workspace-defaults file;
  request-specific options remain available. The initial audit fixed JetBrains
  `@timeout` units, `//` directives, `# @name =`, abbreviated GET, and multiline URLs.
  Versioned fixtures cover editable requests/bodies and opaque directives, scripts,
  output redirects, HTTP versions, and unimplemented protocols. Opaque blocks open
  as exact raw content with builder/omnibar editing disabled; execution, save, move,
  and duplication are blocked. The interactive client keeps one environment catalog
  and collection across projects; explicit headless file runs retain directory-based
  environment resolution.
- **Phase 3 — complete within current scope:** search, folding, JSONPath, copy/save,
  binary responses, redirects, cookies, timing, opt-in history, diff, and full download.
  `[C]` controls cookie reads/writes per request, appears in preview, and round-trips
  as `@no-cookie-jar`. Explicit HTTP/HTTPS proxy, `@proxy`, cURL `--proxy`, per-request
  TLS verification, `@insecure-tls`, and cURL `--insecure` are implemented. Insecure
  TLS requires target/environment/session approval in the TUI or `--allow-insecure-tls`
  headlessly. Load auditing confirmed stream cancellation at 1.5 MB and led to a
  native preview capped at 50,000 characters. Desktop opening is limited to
  PNG/JPEG/GIF/WebP/BMP with matching MIME/signatures; SVG, PDF, generic binary, and
  forged MIME can only be saved. Full download resends only GET, caps at 256 MB,
  rejects non-2xx responses, and removes partial files on cancellation/stream/disk failure.
- **Phase 4 — complete within current scope:** Postman/OpenAPI preview imports,
  assertions, chaining, volatile secret extraction, TUI dataset/concurrency runner,
  and text/JSON/JUnit CLI reports. Individual sends use the same engine and resolve
  dependencies topologically. Versioned Postman v2.0/v2.1, OpenAPI 3.0 JSON, and 3.1 YAML
  fixtures cover inheritance, secrets, bodies, local `$ref`, `allOf`, servers,
  overrides, and explicit losses. CLI/TUI import, preview, and protected writes
  are exercised without leaking literals.
- **Phase 5 — deliberately not started:** OAuth2, certificates, SSE, WebSocket,
  scripting, GraphQL, and gRPC remain subject to the evidence requirements below.

Phases 0–4 met their recorded definition of done. Manual auditing used
WezTerm/WSL2 and tmux with Bun 1.3.14. GNU Screen, VS Code Terminal, Windows Terminal,
and macOS were unavailable in that audit and remain future compatibility validation,
not known functional gaps. The recorded gate passed 337 unit and 44 TUI tests with
no failures, architecture violations, or maintainability regressions. These are
historical results, not current release qualification. Phase 5 remains outside scope
until supported by demand and security evidence.

## Goals and non-goals

### Goals

1. Make frequent requests fast with keyboard and mouse.
2. Keep interactive collections, environments, and examples in one global HTTP home
   as interoperable text files.
3. Give responses most usable space and real debugging tools.
4. Preserve cancellation, timeout, capture limits, multilingual UI, and Runner-port
   integration as requirements of the rebuild.
5. Prevent credential leakage through history, exports, logs, and private files by default.
6. Enable later headless execution, assertions, and protocols without turning
   `HttpWorkspace.tsx` into a monolithic controller.

### Immediate non-goals

- Reproducing the entire Postman feature set.
- Continuous cloud synchronization and real-time collaboration. Explicit
  Postman account reads, imports, and linked request/collection writes are documented in
  [docs/design/postman-account.md](./docs/design/postman-account.md).
- Running imported scripts without consent and isolation.
- Implementing GraphQL, gRPC, MQTT, WebSocket, and SSE in the initial sequence.
- Creating a proprietary format when `.http` serves the core use case.
- Copying another project's code or visual identity.

## Research method and sources

The research examined documentation, screenshots, and source at the following
snapshots. Links identify the inspected revision where available. Comparisons below
are historical observations, not claims about later versions.

| Project | Snapshot | Stack | Main material |
| --- | --- | --- | --- |
| Tuiminal | Local worktree on 2026-09-04 | Bun, OpenTUI, React | Former `HttpWorkspace.tsx`; current [collection-runner.ts](./packages/feature-http/src/services/collection-runner.ts) and [http.test.ts](./tests/http.test.ts) |
| Posting | [`56703a1`](https://github.com/darrenburns/posting/tree/56703a11513e8e74e681b4f859f31945b71e746f), v2.10.0 | Python, Textual, httpx | [Guide](https://posting.sh/guide/), [navigation](https://posting.sh/guide/navigation/), [roadmap](https://posting.sh/roadmap/) |
| ATAC | [`e5daf66`](https://github.com/Julien-cpsn/ATAC/tree/e5daf666e5b5fc75eb787f1551083fdc37507ffb), v0.23.1 | Rust, Ratatui, reqwest | [README and features](https://github.com/Julien-cpsn/ATAC#features) |
| Restless | [`b5d7d3e`](https://github.com/shahadulhaider/restless/tree/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3) | Go, Bubble Tea, `net/http` | [README](https://github.com/shahadulhaider/restless), [keybindings](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/docs/keybindings.md) |
| post-tui | [`b73d912`](https://github.com/raufendro-dev/post-tui/tree/b73d91273447c05f7acdd3f4f9cdf5cedd901f48), v1.0.3 | Rust, Ratatui, reqwest | [README, limitations, and roadmap](https://github.com/raufendro-dev/post-tui#current-limitations) |
| `.http` syntax | 2026.2 documentation | Interoperable file format | [Syntax](https://www.jetbrains.com/help/idea/exploring-http-syntax.html), [variables/private files](https://www.jetbrains.com/help/idea/http-client-variables.html) |

### UX/UI design basis

Design draws on general interaction principles, terminal guidance, and observed TUI
limitations, in addition to competitor appearance.

| Evidence | Consequence for Tuiminal |
| --- | --- |
| [Nielsen's heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): visible state, user control, consistency, error prevention, recognition, and minimalism. | Keep execution, focus, environment, dirty state, truncation, and result visible; make cancellation/undo explicit and primary actions discoverable. |
| [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and [complex application design](https://www.nngroup.com/articles/complex-application-design/). | Keep Params, Headers, Body, and Auth visible; put infrequent options in More, a command palette, or contextual menus. |
| [Textual layout guidance](https://textual.textualize.io/how-to/design-a-layout/): sketch regions, define scrolling, build outside-in, allocate flexible space. | Declare pane minimums/maximums, scrolling policies, and priorities. Response takes elastic space; bars and request identity stay stable. |
| [TUIKit foundations](https://github.com/github/TUIKit/blob/main/docs/foundations.md): measure columns/rows, use animation sparingly, align focus with visual order. | Breakpoints use feature content constraints and usable area, with left-to-right/top-to-bottom focus and non-animation status signals. |
| [CLI Guidelines](https://clig.dev/): feedback within 100 ms, progress, timeout, actionable errors, intentional color, simple automation output. | Sending immediately shows phase and cancellation; errors explain a next action; headless text/JSON/JUnit output is stable. |
| [GitHub CLI accessibility](https://github.blog/engineering/user-experience/building-a-more-accessible-github-cli/): redraw, ornamental prompts, and spinners can confuse screen readers; configurable 4-bit colors help. | Plan accessible/reduced-motion behavior with static progress, less decoration, and no truecolor dependency; test light/dark/high-contrast palettes. |
| [WCAG2ICT terminal guidance](https://github.com/w3c/wcag2ict/blob/main/text-command-line-terminal-applications-and-interfaces.md), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum), and [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html). | Resize must preserve functionality; combine text, background, and accent for state/focus; use one column on narrow terminals rather than unnecessary two-dimensional scrolling outside tables/editors. |
| [lazygit UX discussion](https://github.com/jesseduffield/lazygit/issues/1712): novice/expert needs and conflicting global/local bindings. | Confirm dangerous actions by default; consider later preferences; never repurpose a global shortcut by pane, and expose local bindings contextually. |

These sources provide testable criteria, not web/linear-CLI rules transplanted
literally. Every fullscreen state should answer where focus is, what is selected,
what is running, what changed, and what can happen next without color or memory alone.
Roadmap-only features were not treated as implemented. “Not identified” means absent
from inspected documentation/execution paths, not that no other revision ever had it.

## Diagnosis before the rebuild

This section records the research starting point, not presumed defects in the current
implementation. Consult implementation status before opening new work.

### Previous capabilities

- GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- Scheme-less URLs normalized to `http://`; non-HTTP schemes rejected.
- Text headers, text/JSON bodies, and automatic `Content-Type`.
- Status, total duration, captured bytes, headers, and formatted JSON.
- 30-second timeout, `AbortController` cancellation, and roughly 1.5 MB capture limit.
- Up to 30 session calls in history.
- Side-by-side request/response with narrow-terminal pane fallback.
- Runner-detected URLs forwarded to HTTP.
- Mouse support for main buttons/lists and integrated Tuiminal translations.

The previous three HTTP tests covered normalization, basic header parsing, and one
local JSON request. New contract tests replace them; old tests do not dictate names,
types, or architecture. Coverage must establish TUI behavior, cancellation,
truncation, redirects, binary/error handling, ownership, and security.

### Previous product gaps

- No project collection, saved requests, folders, search, or multiple open requests.
- History, drafts, and responses lived only in React state and disappeared on restart.
- No dedicated query/path editors with explicit order, duplicates, or enable/disable.
- No structured authentication, environments, variables, or secret separation.
- Raw-only bodies, without forms, multipart, files, or explicit kinds.
- Body/headers-only response view: no Pretty/Raw, cookies, redirects, available timing
  stages, search, JSON folding, copy, download, or diff.
- No cURL, `.http`, Postman, or OpenAPI import/export.
- No assertions, headless execution, or collection runner.

### Previous technical and interaction risks

- `HttpWorkspace.tsx` combined roughly 731 lines of layout, state, keyboard,
  execution, history, and presentation, making further features harder to test.
- `HttpRequestDraft` used one header string and one body string, unable to represent
  enable/disable, sensitivity, files, body kinds, authentication, or variable provenance.
- Switching Headers/Body used a `key` that remounted the textarea, risking cursor,
  selection, and undo history. New editors must stay mounted while inactive.
- Global keyboard scope knew only URL/editor; history and response scrolling also
  took focus, and history `[Esc]` did not explicitly consume the event. Test real
  propagation before expanding the TUI.
- `Response.headers.entries()` alone is insufficient for ordered duplicate headers,
  particularly `Set-Cookie`.
- Retained bytes do not necessarily equal declared/transferred size when truncated.
- `fetch` measures total duration but does not expose detailed DNS/TCP/TLS timings;
  the UI must not invent measurements.
- Thirty maximum-size responses can retain tens of megabytes. Entry count and total
  body budget must be independent limits.

## Historical feature comparison

“Tuiminal baseline” refers to the pre-rebuild snapshot above.

| Capability | Tuiminal baseline | Posting | ATAC | Restless | post-tui |
| --- | --- | --- | --- | --- | --- |
| Simultaneous request/response | Yes | Yes | Yes | Alternating | Yes |
| Local collection | No | Directory + per-request YAML | JSON/YAML | `.http` files | Internal JSON + Postman import |
| Environments/variables | No | `.env`, hot reload | Environment files | JSON, inline, dynamic | No |
| Structured parameters | No | Query/path | Query/path | `.http` syntax | Query |
| Structured auth | No | Basic, Digest, Bearer | Basic, Bearer, Digest, JWT | `.http` header | Basic, Bearer, API key |
| Non-raw bodies | No | Raw/URL encoded | Raw, form, multipart, file | Inline/file | No |
| Advanced response | Body/headers | Body, headers, cookies, scripts, trace | Body/image, cookies, headers, console | Body, headers, timing, assertions, folding | Pretty, tree, raw, HTML, headers, error |
| Comparable history | Session, 30 | Not identified | Response can accompany request | Per-request persistent + diff | Persistent, 100 |
| Response search | No | Planned | Not identified | Yes | Yes |
| cURL | No | Import/export | Import/export + other languages | Import/export + codegen | Export |
| Postman/OpenAPI import | No | Both experimental | Both | Postman, Insomnia, Bruno, OpenAPI | Postman v2.0/v2.1 |
| Assertions/headless | No | Tests planned | Broad CLI; assertion framework not identified | Yes | No |
| Explicit cancellation | Yes | Async worker; clear cancel action not identified | `CancellationToken` | Not identified in TUI | Planned |
| Explicit body limit | 1.5 MB | Not identified | Not identified | No; full read | No; full read |
| Documented/implemented mouse | Partial | Full | Not identified | Full, including divider | Not identified |
| Automated tests in snapshot | 3 HTTP | Unit + TUI snapshots | Not identified | Broad module/TUI coverage | Not identified |
| Internationalization | 6 languages | No | No | No | No |

## Strengths and limitations of each reference

### Posting

**Adopt:** stable URL/send bar; clear choose/build/send/inspect hierarchy with a side
collection and stacked request/response; compact method/status colors; specialized
request Headers/Body/Path/Query/Auth/Info/Scripts/Options and response
Body/Headers/Cookies/Scripts/Trace tabs; jump mode `[Ctrl+O]`, contextual `[F1]` help,
command palette, autocomplete, external editor/pager integration; compact mode that
removes borders/padding while retaining surface hierarchy.

**Improve:** the reviewed roadmap identified a crowded footer, missing manual resize,
response search, collection/environment switchers, and state context. Move infrequent
tabs into More/palette and show badges only for content. Respect launch-directory
collections rather than replacing them with a global default; global scratch may
remain optional. Preserve privacy while adding comparable execution history, which
was not identified in the snapshot. [Python scripts](https://github.com/darrenburns/posting/blob/56703a11513e8e74e681b4f859f31945b71e746f/docs/guide/scripting.md)
run in the same process/environment and the docs warn about destructive global
operations; do not copy that execution model. Adopt composition without reproducing
a large central controller. Internationalization/double-width handling appeared as
future work there, but are Tuiminal requirements from the first component.

### ATAC

**Adopt:** explicit coverage of bodies, auth, proxy, redirects, cookies, files, export,
and WebSocket as a maturity checklist; readable, backward-compatible local JSON/YAML
collections; configurable keymaps/themes with event-derived help; HTTP/WebSocket
modeled as protocol variants instead of scattered flags.

**Improve:** roughly 18,000 Rust lines and a [state enum](https://github.com/Julien-cpsn/ATAC/blob/e5daf666e5b5fc75eb787f1551083fdc37507ffb/src/tui/app_states.rs)
with many editor modes argue for per-pane/modal/tab state and testable reducers
rather than a combinatorial global machine. The [main layout](https://github.com/Julien-cpsn/ATAC/blob/e5daf666e5b5fc75eb787f1551083fdc37507ffb/src/tui/ui/ui.rs)
uses fixed 20/80 and 50/50 proportions; Tuiminal must honor dimensions, content, and
user-adjusted dividers. No automated suite or mouse support was identified: require
deterministic auth/import/script tests and clickable visible actions. The README
labels OpenAPI import as AI-generated and potentially buggy; treat imports as
untrusted parsing with preview, validation, and fixtures before project writes.
Breadth is not a reason to add protocols before HTTP is solid.

### Restless

**Adopt:** simple, versionable, IDE-compatible `.http` with multiple requests,
variables, names, and assertions; per-request history and response comparison;
Pretty/Raw, JSON folding, search, line navigation, wrap, visual selection, JSON path,
OSC52 copy, and codegen; assertions, chaining, headless and data-driven runs using
one request definition; separate parser, engine, history, importers, exporter,
scripts, writer, and TUI with focused tests; external-body paths constrained to
the collection.

**Improve:** keep request/response simultaneously visible when space permits rather
than alternating. Offer multi-key prefixes only with contextual which-key guidance;
essential actions need one shortcut. Do not imply full visual editing when assertions
or scripts remain opaque. The [engine](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/internal/engine/engine.go)
reads entire bodies, risking blocking/exhaustion; retain Tuiminal's bounded streaming.
The [history implementation](https://github.com/shahadulhaider/restless/blob/b5d7d3e34cccaf0c7e98fae8cb3d9c3e6e1818b3/internal/history/history.go)
uses `0755` directories and `0644` files and serializes unredacted requests/responses.
Use redacted metadata by default with `0700`/`0600`. JavaScript script timeouts do
not isolate in-process execution; defer scripting until an isolated, permissioned
internal runtime exists.

### post-tui

**Adopt:** immediately understandable sidebar/builder/response regions; request
summaries before editing; progressive disclosure for Pretty/tree/Raw/HTML/headers/error;
one sidebar for imports, saved requests, and history; explicit documented limitations.

**Improve:** the [fixed sidebar and 48/52 split](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/ui.rs)
fit small terminals/long content poorly. Compact header/body buffers lack multiline,
variables, request tabs, and environments, which were roadmap items. Requests run
on the main path without cancellation or configurable timeout. [Transport](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/http.rs)
records duration after headers but before body reading, so it is not total duration;
it fully reads and lossily decodes bodies, including binary content. [Storage](https://github.com/raufendro-dev/post-tui/blob/b73d91273447c05f7acdd3f4f9cdf5cedd901f48/src/storage.rs)
writes requests/history including auth to JSON without explicit mode protection or
redaction. `app.rs` had roughly 1,350 lines and `ui.rs` 637, with no tests found.
Treat it as a product prototype rather than an architectural template.

## Observed public backlog pressure

Snapshot: 2026-09-04. Counts include bugs, enhancements, questions, and duplicates;
they indicate public demand, not absolute quality.

| Project | Open issues | Observed signals | Consequence |
| --- | ---: | --- | --- |
| [Posting](https://github.com/darrenburns/posting/issues) | 67 | Params sent as `null` ([#362](https://github.com/darrenburns/posting/issues/362)), another request's response in the active view ([#320](https://github.com/darrenburns/posting/issues/320)), ignored client certificate ([#325](https://github.com/darrenburns/posting/issues/325)); requests for built-in variables ([#279](https://github.com/darrenburns/posting/issues/279)), headless CLI ([#303](https://github.com/darrenburns/posting/issues/303)), OAuth2 ([#306](https://github.com/darrenburns/posting/issues/306)). | Per-tab `executionId` ownership, inspectable resolved requests, tests before certificates/OAuth2, variables/automation as foundational models. |
| [ATAC](https://github.com/Julien-cpsn/ATAC/issues) | 13 | Pending request after post-script failure ([#209](https://github.com/Julien-cpsn/ATAC/issues/209)); cookie ([#163](https://github.com/Julien-cpsn/ATAC/issues/163)), AltGr ([#204](https://github.com/Julien-cpsn/ATAC/issues/204)), Vim/yank and GNU Screen issues; collection variable/header/auth inheritance ([#124](https://github.com/Julien-cpsn/ATAC/issues/124)) and `.http` ([#109](https://github.com/Julien-cpsn/ATAC/issues/109)). | Every async path settles; keyboard/terminal matrix, explicit inheritance, and `.http` precede more protocols. |
| [Restless](https://github.com/shahadulhaider/restless/issues) | 0 | No current tracker requests; product demonstrates `.http`, history diff, assertions, chaining, search/folding, and mouse resize. | Adopt versionable data/debugging while testing privacy, body bounds, and discoverability; zero issues does not mean zero risk. |
| [post-tui](https://github.com/raufendro-dev/post-tui/issues) | 0 | [Roadmap](https://github.com/raufendro-dev/post-tui#roadmap) lists multiline editing, variables, collection export, background/cancellation, clipboard, request tabs, and settings. | Model these capabilities without blocking scratch; avoid adding cancellation, variables, and tabs as central-component flags. |

Common requirements: unambiguous request/response identity, termination of every
loading state, terminal-compatible focus, explicit inheritance, redacted persistence,
and accessible headless execution. Additional protocols come later.

## Product direction

### Principles

1. **Global interactive home:** collections, environments, and opt-in history in the
   interactive HTTP tab use one data directory, independent of the CLI project directory.
   Explicit headless file commands retain their input/output paths.
2. **Immediate scratch:** paste a URL and send without creating files.
3. **Adapted visual design:** Posting hierarchy with Tuiminal palettes, framed/compact
   layouts, controls, i18n, and conventions.
4. **Response priority:** after sending, focus/space favors results without hiding
   requests on wide terminals.
5. **Text as source of truth:** `.http` stores requests; ephemeral UI state stays out.
6. **Protective, bounded defaults:** no automatic scripts, raw history, implicit host
   environment, or unbounded reads.
7. **Honest capabilities:** show only measured timing and identify truncation,
   redaction, or nonpersistent data.
8. **Interaction parity:** keyboard and mouse reach actions; `[Esc]` closes one layer.
9. **Interoperability first:** `.http` and cURL precede Tuiminal-specific formats/SDKs.
10. **Shared automation model:** TUI and `tuiminal http run` use the same preparation,
    transport, assertions, and security policy.

### Success indicators

- New users can send a URL, edit JSON, and understand a response without help.
- Frequent users can open, switch, run, and save entirely by keyboard, with mouse
  controls for the same actions.
- At 80×24, no overlap or clipped actions block either request or response; at
  120×30 both remain visible.
- Cancellation interrupts reading and stops updates within one event-loop iteration.
- Capture bounds hold for normal, chunked, and compressed bodies.
- Credentials do not reach persistent history, logs, exports, or errors without
  explicit user action.
- Saving/reopening `.http` preserves requests, comments, and visually unsupported blocks.
- Relevant new logic has tests, with `bun run check` as the final gate.

## Target experience and layout system

### Interaction model and hierarchy

The workspace follows `choose → build → execute → inspect`. Users can enter at any
step while geometry stays predictable:

1. Document tabs identify mounted requests and dirty state.
2. The omnibar keeps method, resolvable URL, environment, and send/cancel in a stable
   location across layouts.
3. Navigation switches collection/history without competing trees.
4. The request builder handles request preparation.
5. The response inspector takes flexible space and execution state.
6. A contextual footer shows a few valid actions; `[F1]` opens the full map.

Document tabs have a separate strip above the omnibar. Internal
Params/Headers/Body/Auth and Pretty/Raw/Headers/Timing tabs belong to their panes,
so two navigation levels never look like one ambiguous strip.

### Persistent anatomy

```text
 GET list users ● ×   POST create user ×   [Ctrl+N]
 GET ▾ https://api.example.com/users/{{id}}  environment: dev ▾ [S] Send
 ──────────────────────────────────────────────────────────────────────
 adaptive area: navigation | request | response
 ──────────────────────────────────────────────────────────────────────
 short help for current focus                        [F1] All shortcuts
```

- Active documents use background + accent. `●` means modified; `×` is the mouse
  close control, with `[Ctrl+W]` tooltip.
- The omnibar remains visible when collection, history, or response has focus. At
  minimum width it wraps to two rows before truncating the URL or send control.
- Method/environment pickers open by mouse or `[Enter]`. Environment identity never
  silently disappears, especially when marked production.
- During execution, `[X] Cancel` replaces `[S] Send` in place and response immediately
  announces the active phase.
- Footer contains at most five primary actions ordered by frequency/context. Rare
  actions belong to `[F1]` or a future `[Ctrl+P]` command palette.

### Constraint-based layout resolution

Breakpoints use **usable feature width/height** after global navigation. These are
prototype starting points; the resolver picks a mode only if every minimum fits,
otherwise moving to the next smaller composition.

| Mode | Initial condition | Composition | Main constraints |
| --- | --- | --- | --- |
| Panorama | `W ≥ 132`, `H ≥ 24` | `navigation │ request │ response` | Navigation 22–32 columns; request/response start equally wide with minimum width 42 each. |
| Workbench | `W ≥ 96`, `H ≥ 22` | `navigation │ request above response` | Navigation 22–30; right area at least 65; request/response initially equal height. |
| Focus | `W ≥ 72`, `H ≥ 18` | Stacked request/response, no fixed sidebar | Collection/history use drawers; equal starting heights subject to pane minimums. |
| Minimum | Below those limits | One pane at a time | Two-row omnibar and local Collection/Request/Response selector; no missing functionality. |

Fallback order: collapse navigation, stack request above response, wrap omnibar,
then use one pane. Never silently compress editors, responses, or buttons into
unusable space. Apply ratios after minimums. Preserve user-adjusted dividers by
mode during the session, clamping safely on resize.

### Panorama: three columns

Use when response still has useful width for code, tables, and headers, taking
advantage of ultrawide terminals without excessively long JSON lines.

```text
 GET list ● ×   POST create ×   [Ctrl+N]
 GET ▾ https://api.example.com/users/{{id}}    dev ▾    [S] Send
┌ NAVIGATION ─────────┬ REQUEST ─────────────────┬ RESPONSE ─────────────────┐
│ Collection History  │ Params Headers Body Auth │ 200 OK · total 143 ms     │
│ / search            │                          │ Pretty Raw Headers Timing │
│ ▾ api               │ id       42              │ 1 {                       │
│   ▾ users           │ verbose  true            │ 2   "id": 42,             │
│     GET list ●      │                          │ 3   "name": "Ada"         │
│     POST create     │                          │ 4 }                       │
└─────────────────────┴──────────────────────────┴───────────────────────────┘
 Params: [Enter] Edit [Space] Enable [N] Add                    [F1] Help
```

Use post-tui's immediate readability and Posting's hierarchy with minimums that
avoid fixed-ratio failures. Request/response begin equally wide and retain minimums
while the divider moves. The target design allows dragging navigation/request and
request/response dividers, double-click reset, and keyboard equivalents; consult
implementation status rather than assuming every proposed divider exists.

### Workbench: sidebar and vertical split

Expected for most desktop terminals: retain collection visibility and full right-side
width for request/response content.

```text
 GET list ● ×   POST create ×   [Ctrl+N]
 GET ▾ https://api.example.com/users/{{id}}  dev ▾ [S] Send
┌ NAVIGATION ─────────┬ REQUEST · Params Headers Body Auth More ──────────┐
│ Collection History  │ key/value, editor, or active section form         │
│ / search            ├ RESPONSE · Pretty Raw Headers Timing More ────────┤
│ ▾ api               │ 200 OK · JSON · headers 68 ms · total 143 ms      │
│   ▾ users           │ 1 {                                               │
│     GET list ●      │ 2   "id": 42                                      │
└─────────────────────┴───────────────────────────────────────────────────┘
```

Start at 50/50. `[Ctrl+↑/↓]` adjusts in stable steps; `[F10]` maximizes the focused
pane and restores the previous split. Collection/History are modes of one sidebar,
not permanent parallel lists. History groups runs by request and supports comparison
without cluttering the collection tree.

### Focus: no fixed sidebar

Around 80×24, collection/history become left drawers without remounting editors.
Request/response remain simultaneous while usable height satisfies minimums.

```text
 GET list ● ×   [Ctrl+N]
 GET ▾ http://localhost:3000/users  dev ▾ [S] Send
 [C] Collection  [Y] History
 REQUEST · Params Headers Body Auth More
 ──────────────────────────────────────────────────────────────────────
 RESPONSE · Pretty Raw Headers Timing More
 200 OK · 143 ms · 12 KB
```

Opening a drawer focuses it; closing restores its trigger. Target drawer sizing is
24–70% of width, without covering environment identity or discarding pane state.
Internal tab strips scroll as a unit only when essential labels cannot fit; content
must not draw over the last button.

### Minimum: one pane at a time

```text
 GET list ● ×   [Ctrl+N]
 GET ▾ http://localhost:3000/users
 dev ▾                                      [S] Send
 [C] Collection   [1] Request   [2] Response
 ─────────────────────────────────────────────────────
 active pane content
 ─────────────────────────────────────────────────────
 [Tab] Navigate [Enter] Open                  [F1] Help
```

Sending selects Response; `[1]` returns to Request with cursor, selection,
autocomplete, and scroll preserved. Local selectors keep the same meaning across
breakpoints. Status, duration, size, and truncation wrap rather than disappearing.
Below safe control minimums, show the recommended terminal size instead of painting
unusable fragments.

### Progressive disclosure within panes

Posting demonstrates specialized tabs but its roadmap also notes crowding; ATAC
illustrates the cost of many simultaneous modes. Keep stable top-level sections:

- Request: Params, Headers, Body, Auth, More.
- Params contains Query/Path subsections, counts, and validation rather than two
  permanent top-level tabs.
- Request More contains Options, generated documentation, and future certificates/scripts.
- Response: Pretty, Raw, Headers, Timing, More.
- Response More contains Cookies, Redirects, Assertions, and Console; badges signal
  content/failure without moving tabs.
- Active tab, errors, and counts have text/symbols as well as color.
- Promote advanced features only when usage evidence justifies permanent visibility.

### Focus, navigation, and mouse

- `[Tab]`/`[Shift+Tab]` follow `route → collection → request → response`. `[H/L]`
  and, outside JSON tree navigation, `[←/→]` offer equivalent pane movement.
  `[Tab]` deliberately leaves HTTP inputs; other text keys retain native editing.
- With Request focused and no editor owning keys, `[A←]`/`[F→]` cycles
  `Params → Headers → Body → Auth → More`. Show controls only in that focus and
  keep focus in the pane for repeated cycling.
- Nested horizontal strips use `[Z←]`/`[V→]`: Body/Auth kinds and request/response
  More subsections. Primary response views use `[A←]`/`[F→]`. None crosses a
  focused editor.
- In Params, `[J/K]` or `[↑/↓]` switches Query/Path focus. Only the focused subpanel
  shows and accepts `[N] Add`.
- Bounded valid JSON Pretty uses `[↑/↓]`/`[J/K]` for blocks, `[←/→]` to
  collapse/expand, and `[Enter]` to toggle. Selected paths and folded blocks belong
  to the document and never change captured bytes.
- `[Ctrl+O]` opens jump mode with stable target letters across breakpoints.
- Global shortcuts never gain a conflicting local meaning. Infrequent actions move
  to menus/help instead of overriding established navigation.
- `[Esc]` closes one layer: autocomplete → input → modal/drawer → maximization →
  screen. Each layer consumes the event before restoring focus.
- Hidden panes/inactive tabs receive no input, wheel, or shortcuts.
- Clicking establishes focus and performs the intended action; hit areas cover the
  entire label, not one glyph.
- Wheel scrolls under the pointer; drag changes only dividers. Native terminal
  selection remains available through a documented action/modifier.
- Subtle scrollbars show position when useful; keyboard navigation also communicates
  start/end in text.

### Visual state and feedback

| User question | Required treatment |
| --- | --- |
| Where is focus? | Accent, background, and active title; not a thin border or hover alone. |
| What changed? | Modified marker, per-section counts, and confirmation before draft loss. |
| Which environment is used? | Name always in omnibar; production marked `PROD` with text and danger color. |
| Did execution start? | Sending/waiting-for-headers state and `[X] Cancel` within one UI update. |
| Did it finish? | Text status, final URL, type, bytes, and measured timing in response header. |
| Is something incomplete? | Explicit truncated, redacted, insecure-TLS, and history-disabled labels. |
| Which request owns the result? | Name/method and `executionId` associated with the tab; late results cannot target another tab. |
| How do I fix an error? | Human summary, probable cause, next step, and `[D] Details`; redact technical details. |

Animation is supplementary. A normal-mode spinner may accompany text, but phase and
elapsed time remain useful if animation stops. Success, warning, error, method,
and selection have labels/symbols that work without color.

### Accessibility and terminal compatibility

- Respect a future global accessible/reduced-motion setting; until available, keep
  a testable nonanimated prototype variant.
- That variant replaces spinners with infrequently updated static text, reduces
  decorative borders, and adds selected/error/modified labels where visual mode
  might otherwise rely on glyphs/colors.
- Focus follows reading order; prompts have labels rather than requiring visual
  scanning. Help is contextual, searchable, and available outside the TUI.
- Semantic palettes should map to 4-bit/256/truecolor and be checked on light, dark,
  and high-contrast backgrounds. Essential information must not depend on `dim`.
- CJK, Portuguese, and other text use grapheme-aware widths. Truncation preserves
  shortcuts/state and offers complete values in detail.
- Headless output is the linear automation alternative: no animation without a TTY,
  respect `NO_COLOR`, and offer stable JSON for assistive tools.

### Proposed shortcut map

Retain current bindings during migration. Document new ones only with equivalent
mouse controls and propagation tests. This remains a target map; implemented
bindings are documented in the README.

| Action | Shortcut |
| --- | --- |
| Focus URL | `[/]` |
| Send | `[S]` outside inputs; `[Ctrl+Enter]` in an editor |
| Cancel | `[X]` during execution |
| Next / previous method | `[M]` / `[Shift+M]` |
| Switch route / collection / request / response | `[Tab]` / `[Shift+Tab]` or `[H/L]` |
| Cycle focused Request sections | `[A←]` / `[F→]` |
| Cycle nested horizontal strip | `[Z←]` / `[V→]` |
| Switch Query / Path Params | `[J/K]` or `[↑/↓]` |
| Add to focused subpanel | `[N]` |
| Switch primary Response views | `[A←]` / `[F→]` |
| Navigate / collapse / expand JSON blocks | `[↑/↓]` or `[J/K]` / `[←/→]` / `[Enter]` |
| Search focused response | `[Ctrl+F]` |
| Open collection | `[C]` |
| Toggle history | `[Y]` |
| New scratch request | `[Ctrl+N]` |
| Save request | `[Ctrl+S]` |
| Close request | `[Ctrl+W]` |
| Cycle open requests | `[Alt+←/→]` |
| Jump mode | `[Ctrl+O]` |
| Contextual help | `[F1]` |
| Adjust split | `[Ctrl+↑/↓]` |
| Maximize/restore pane | `[F10]` |
| Close autocomplete/input/modal/pane | `[Esc]`, one layer at a time |

`[/]` always focuses URL rather than becoming contextual search. Response search uses
`[Ctrl+F]`. Reserve `[Ctrl+P]` for a command palette only when enough rare actions
justify one; do not create an empty palette merely to resemble Posting.

### Required visual prototype matrix

Before connecting collections, environments, or new transport, render realistic
fixtures at `60×16`, `72×18`, `80×24`, `96×24`, `120×30`, and `160×40` in framed/compact.
Review:

- Long URLs, six document tabs, CJK names, and wide translations.
- Deep JSON, long text, binary/empty responses, errors, and loading.
- Enough headers/params to require vertical/horizontal scrolling.
- Mouse, divider drag, resize during editing, and focus restoration.
- macOS/Windows/Linux, VS Code Terminal, tmux, and GNU Screen where available.
- AltGr, arrows, function keys, `[Cmd+C]`/selection, and documented fallbacks.
- 4-bit/256/truecolor palettes on light/dark/high-contrast backgrounds.
- Accessible/reduced-motion variant without animation or color-only meaning.

Breakpoints become implemented decisions only after this matrix. Screenshots alone
are insufficient: tests must send keys, move the mouse, resize, and assert focus,
preserved content, and the layer closed by `[Esc]`.

## Target functional specification

### Request builder

- Standard method presets plus a valid custom HTTP method field.
- URL highlighting, history/variable autocomplete, and secret-safe resolved preview.
- Ordered, duplicate-preserving Query/Path key/value tables with enable/disable,
  predictable URL synchronization, and a shared Params section.
- Path substitution replaces full `:name` segments or `{name}` tokens only in the
  pathname, never authority/query/fragment. The first enabled duplicate wins;
  resolved values are encoded once without recursive substitution.
- Header key/value autocomplete, duplicates, and provenance badges for inherited/
  automatically added values.
- Initial structured No Auth, Bearer, Basic, API Key; Digest, OAuth2, and client
  certificates follow the protective foundation.
- None, JSON, raw/text, XML, URL-encoded form, multipart, and file bodies.
- Visible automatic Content-Type that users can override.
- Timeout, redirects, cookie jar, proxy, and TLS verification options.
- Per-request dirty state with warnings before destructive close/switch.
- Up to six mounted requests; reopening the same request focuses its existing tab.
- Inspectable prepared-request preview showing inherited/resolved values and automatic
  headers without revealing secrets.

### Collections and `.http` format

- Discover `.http`/`.rest` under the global interactive HTTP home, ignoring `.git`, `node_modules`,
  build trees, and symlinks escaping the root.
- Suggest `.tuiminal/http/` for new requests without making it the only scanned path.
- Support multiple requests separated by `###`, named with `# @name`.
- Parse an AST with trivia preserving comments, order, whitespace, and unknown blocks.
  Visual editing must not regenerate whole files from a lossy model.
- Blocks that cannot be safely edited open as raw content with an explanation;
  saving supported parts must not remove them.
- Tree represents folders/files/requests with fuzzy search, duplicate, rename, move,
  and confirmed deletion.
- Watch external changes. Dirty conflicts require a diff and explicit choice,
  never silent overwrite.
- Optional workspace/collection defaults may use `.tuiminal/http/config.json`,
  separate from canonical `.http`. Allow nonsecret headers/options and auth references,
  never literal tokens/passwords. Prototype and version its schema before freezing.

Initial canonical example:

```http
@baseUrl = https://api.exemplo.com

### Buscar usuário
# @name buscar-usuario
GET {{baseUrl}}/users/{{userId}}
Accept: application/json
Authorization: Bearer {{apiToken}}

# @assert status == 200
```

### Environments and secrets

- Read existing public values from `http-client.env.json`, but write every new
  interactive environment to `http-client.private.env.json` in the global HTTP home.
  The form shows values while editing and has no public/private storage toggle.
- New and edited values always go to the operating system credential store. Private
  storage uses `0700` directories and atomic `0600` files containing opaque references.
- Variable precedence: request > file > selected environment (private or public) >
  always-active Globals > dynamic built-in. Identify the winning
  source for duplicates.
- The interactive environment selection applies to every request and collection.
  Explicit headless `.http` file runs still resolve an environment from the file's
  directory through its parents to the supplied root.
- `[E]` lists selectable environments. `[N]` creates, `[E]` edits/renames, `[D]`
  deletes after confirmation, and `[G]` edits always-active `Globals` with a fixed
  name. The form contains a name plus variable/value table.
  `[/]` chooses name or table; empty tables focus the first input, while populated
  tables use arrows or `[H/J/K/L]`, `[Enter]` to edit, `[Tab]` to advance, and layered
  `[Esc]` to leave input and table navigation. The bordered modal owns keyboard and
  pointer focus until closed; underlying workspace focus rails are suppressed.
- The URL suggests variable names after `{` without showing secret values, and `[Tab]`
  completes `{{name}}`. URL query pairs appear in Params; editing them updates the
  URL and preparation sends them only once.
- Header/options/auth precedence: explicit request > nearest collection defaults >
  automatic client values. Preview exposes provenance/conflicts;
  inherited auth must not be indicated by color alone.
- Host environment is blocked by default and requires explicit enablement.
- Mask secrets in preview, autocomplete, logs, history, copy, and errors.
- Switching to production may require per-session confirmation.

### Response inspector

- Stable Pretty, Raw, Headers, Timing, More tabs. Cookies, Redirects, Assertions,
  and Console live in More with content/error badges.
- JSON/XML/HTML highlighting; JSON folding, search, line navigation, wrap, and paths.
- OSC52 copy of selection, line, body, headers, JSON path/value, and redacted cURL.
- Never lossily decode binary as text: show type/size and safe `[S] Save`/`[O] Open`.
- Distinguish status, final URL, content type, encoding, declared/captured/known
  downloaded bytes, and truncation.
- Measure headers, download, and total with `performance.now()`. Show DNS/TCP/TLS
  only if a future transport actually supplies them.
- Optional redirect chain with status and host per hop.
- Classify URL, DNS/connection, TLS, timeout, cancellation, redirect, body, and parse
  errors without including tokens.
- Distinct empty, 204, HEAD, streaming, and truncated states.

### History

- Keep up to 30 session metadata records with a separate global body budget;
  evict older bodies before metadata.
- Interactive history stays in memory for the current session. The old persisted
  history and workspace-defaults controls are not exposed or applied. Known-private
  values remain masked in metadata, errors, and assertions; active response snapshots
  stay exact and volatile, while manual export is separate.
- Requests may declare `@no-log` to omit a session history entry.
- Group by stable request identity, supporting reopen and two-response comparison.
- Rerun uses the current environment and normal preparation/confirmation, never old
  serialized secrets.

### Import, export, and automation

Implementation order:

1. Copy/export cURL with correct quoting and default redaction.
2. Import cURL with preview before replacing drafts.
3. Read, edit, and execute `.http`.
4. Detect Postman v2.0/v2.1/OpenAPI 3.x from an absolute or `~/` source at preview
   time and import into the global HTTP home's fixed `imported/` directory in the
   interactive client, with supported/ignored/conflicting item reports.
   Headless import keeps its explicit source and output paths.
5. Consider Bruno/Insomnia only with demonstrated demand.
6. Declarative assertions and headless execution.
7. Additional codegen after cURL and `.http` are correct.

Target CLI, preserving the accepted `tuiminal http [directory]` spelling while
the interactive HTTP home ignores that directory:

```text
tuiminal http [directory]
tuiminal http run <file>[#request] [--env <name>] [--report text|json|junit]
tuiminal http import curl <command> [--output <directory>]
tuiminal http import postman|openapi <file> [--output <directory>]
```

`run` and `import` are reserved only after `http`; explicit file paths for those
commands retain their own roots. TUI/headless share parser, resolver, transport, assertions, and
redaction. This target sketch must be read alongside implemented scope above.

## Proposed architecture

### Boundaries

```text
packages/feature-http/src/
  index.ts                         minimal feature API
  HttpWorkspace.tsx                thin pane composition (proposed name)
  keyboard.ts                      focus ownership and local shortcuts
  model/
    types.ts                       request, response, environment, history
    workspace.ts                   tabs, panes, modals, and dirty-state reducer
    variables.ts                   resolution, precedence, and masking
    http-file.ts                   lossless AST and request selection
    response.ts                    view model, search, and folding
  services/
    transport.ts                   cancellable contract
    fetch-transport.ts             initial Bun implementation
    request-builder.ts             model to prepared request
    response-reader.ts             streaming, limits, and decoding
    redirects.ts                   policy and credential stripping
  storage/
    collections.ts                 discovery and atomic `.http` writes
    environments.ts                public/private/keychain
    history.ts                     session and opt-in persistence
  importing/
    curl.ts
    postman.ts
    openapi.ts
  exporting/
    curl.ts
  ui/
    HttpTopBar.tsx
    HttpCollectionPane.tsx
    HttpRequestPane.tsx
    HttpResponsePane.tsx
    HttpKeyValueEditor.tsx
    HttpEnvironmentModal.tsx
    HttpHistoryOverlay.tsx
tests/
  http-*.test.ts                    rules and local integrations
  tui/http.test.tsx                real OpenTUI sequences
```

Create directories when their phase exists. This diagram describes dependency
direction, not permission to add empty files or a claim that all proposed names
match the final source tree.

### Essential model

```ts
type HttpRequestDefinition = {
  id: string
  source: { kind: "scratch" } | { kind: "file"; path: string; blockId: string }
  name: string
  method: string
  url: string
  headers: Array<KeyValueEntry>
  query: Array<KeyValueEntry>
  path: Array<KeyValueEntry>
  auth: HttpAuth
  body: HttpBody
  options: HttpRequestOptions
}

type KeyValueEntry = {
  id: string
  enabled: boolean
  name: string
  value: string
  sensitivity: "normal" | "secret-ref" | "literal-secret"
}

type HttpResponseSnapshot = {
  executionId: string
  requestId: string
  requestRevision: number
  status: number
  statusText: string
  url: string
  headers: Array<[string, string]>
  body: Uint8Array
  bodyKind: "text" | "json" | "xml" | "html" | "binary"
  declaredBytes?: number
  capturedBytes: number
  truncated: boolean
  timings: { headersMs?: number; downloadMs?: number; totalMs: number }
  redirects: Array<HttpRedirectHop>
}
```

Use a pure workspace reducer. Each tab preserves draft, response, error, scroll,
search, internal tab, and split. Modals/autocomplete form an explicit stack so
`[Esc]` removes exactly one layer.

Accept results only when `executionId`, `requestId`, and revision still match that
tab's pending execution. Focus changes, closing a tab, and resending must never
attach a late response to another request.

### Execution pipeline

```text
draft
  -> validate without mutation
  -> resolve variables and record provenance/masking
  -> apply visible auth and automatic headers
  -> prepare URL/body/files
  -> confirm dangerous options
  -> execute with AbortSignal
  -> read stream within limits
  -> classify/format without blocking input
  -> update snapshot
  -> record redacted history according to policy
```

Transport knows nothing about React, storage, or components. TUI and CLI use the
same service. HTTP does not import the application; callbacks connect it to Runner
and global navigation, preserving independent first-party workspace boundaries.

### Reuse within Tuiminal

- Mounted-tab patterns, `[Ctrl+↑/↓]` splits, and `[F10]` from the SQL workspace.
- `InlineButton`, mouse selection, and theme surfaces, without a second UI kit.
- Protected atomic writes already used by Runner and Database.
- OSC52 already used by Runner and Database exports.
- Stable project lexing/highlighting where suitable, without remounting editors.
- Lifecycle registration only for HTTP-owned resources such as watchers, workers,
  or persistent cookie jars.

## Security, privacy, and robustness

Required before persistence or import:

- Sanitize ANSI/C0/C1 controls from URLs, headers, and bodies before rendering to
  prevent terminal injection. Keep raw data only in memory/protected files and
  render a safe view.
- Strip `Authorization`, `Proxy-Authorization`, `Cookie`, and configured sensitive
  headers on cross-origin redirects. Local A05 fixes preserve auth/private-header
  provenance; cookies learned at one origin cannot reappear at another on later
  hops. Destination-owned cookies remain available.
- Pause the current transport to confirm cross-origin private bodies/URLs, downgrade,
  or unapproved insecure TLS. `[Y]` approves only that hop; `[I]` remains TLS approval
  by target/environment/session. Never replay POSTs/dependencies to continue a
  redirect. The 16-item confirmation queue accepts one decision per item and retires
  on abort/timeout/unmount.
- Headless private-body/URL redirects require repeatable exact-origin
  `--allow-private-redirect-to <origin>`; downgrade requires
  `--allow-http-redirect-to <origin>`. Insecure TLS remains separately authorized by
  `--allow-insecure-tls`. Original credentials stay stripped after consent. Reject
  non-HTTP/HTTPS redirect schemes and credentials embedded in redirect URLs.
- Bound redirect count and detect loops.
- Apply capture limits after decompression and protect against disproportionate
  compressed payloads.
- Bound body-file reading and preview. Relative paths remain within the collection
  unless an external file is explicitly approved.
- Never put auth, cookies, sensitive queries, or raw bodies in error logs.
- Include sensitive Path values in masking for preview, cURL, conflicts, report URLs,
  evaluated assertions, and diagnostics, even for disabled rows. Reject literal
  secrets in public `.http` while preserving private references and transmitted values.
- Redact exports by default; revealing/exporting secrets requires a clear action.
- System-handler opening requires allowlisted raster MIME and matching magic bytes.
  Never directly open SVG, PDF, or conflicting MIME/extensions. Saving is separate.
- Imported scripts stay disabled. Future scripting requires an isolated process or
  worker, timeout, memory limits, a reduced API, and declared permissions.
- Show insecure TLS in red and require target/environment confirmation.
- Private files/history use `0700`/`0600`, atomic writes, and no unexpected symlink following.
- Imports never overwrite without preview and confirmation.
- Parse errors identify file/line without printing secret values.

## Performance and limits

- Default capture: 1.5 MB per response, configurable only within a safe ceiling.
- History: 30 session metadata records and an initial 12 MB body budget.
- Render response as one styled document, not one renderable per line.
- Format/fold large JSON incrementally or outside the input path.
- Keep URL, body, search, and scrolling responsive during download.
- Cancellation closes the reader and prevents late publication of cancelled results.
- Preserve absolute selection, scroll, and split on resize.
- Discover `.http` incrementally while ignoring large irrelevant trees.
- Close watchers when changing roots or shutting down.
- Stream full bodies larger than capture to a `0600` file, capped at 256 MB, without
  retaining the whole body in memory. Explicitly resend only GET; non-2xx status,
  cancellation, and failures remove the `.part` file.

## Delivery plan

Sizes express relative complexity, not deadlines. Each phase must satisfy its exit
criteria before the next expands the model. See implementation status for completed
phases; these delivery definitions remain as design history and acceptance contracts.

### Phase 0 — stabilize and separate the foundation (M)

Deliverables:

- TUI tests for URL/editor/history/response focus and `[Esc]` propagation.
- Every HTTP focus registered in keyboard scope.
- Extracted workspace reducer/model and response-reading service.
- Execution pinned to `executionId`, request, revision, and tab; reject late/wrong-context results.
- Distinct captured/declared bytes and truncation.
- Repeated headers and text/binary classification.
- Timeout, cancellation, large/chunked/binary/error response tests.
- Remove the old implementation after recording required App/Runner/i18n contracts
  and building their replacements.

Exit criteria:

- New workspace only composes; new parsing/transport/history modules never import
  the previous HTTP service.
- Scratch sends through the new pipeline without a migration adapter.
- `[Esc]` closes history or unfocuses input without exiting the app in the same event.
- Success, error, timeout, and cancellation always settle the correct execution's loading state.
- No tests use external networks or real user data.

### Phase 1 — visual workbench and complete request (L)

Deliverables:

- Fixture-first Panorama/Workbench/Focus/Minimum prototypes before new transport/storage.
- Pure layout resolution by content minimums, usable area, and split preferences in
  framed/compact layouts.
- Initial scratch/session-history sidebar.
- Request Params/Headers/Body/Auth/More; response Pretty/Raw/Headers/Timing/More.
- Up to six mounted scratch documents with dirty state, close, and cycling.
- Adjustable split, maximization, jump mode, and contextual help.
- Reusable key/value editor with mouse, enable/disable, and basic autocomplete.
- No Auth/Bearer/Basic/API Key and JSON/raw/URL-encoded bodies.

Exit criteria:

- Complete workflow at `60×16`, `72×18`, `80×24`, `96×24`, `120×30`, and `160×40`
  without losing actions when layout shrinks.
- Tab/pane/layout changes preserve cursor, draft, response, and appropriate focus.
- Automatic headers are visible before sending.
- Every visible action has mouse access and bracketed shortcuts.

### Phase 2 — projects, `.http`, environments, and cURL (XL)

Deliverables:

- `.http`/`.rest` scanner, tree, search, watcher, and lossless multi-request parser/serializer.
- Save, duplicate, rename, move, and delete requests.
- Private environment creation with public-file read compatibility, variable
  preview/autocomplete, and system credential storage.
- Prototyped, versioned `.tuiminal/http/config.json` schema for nonsecret workspace/
  collection defaults.
- cURL preview import/export with quoting and masking.
- Multipart/file bodies with constrained paths.
- Scratch-to-file migration without data loss.
- Compatibility with `tuiminal http [directory]` while using the global interactive home.

Exit criteria:

- `.http` fixture round-trips do not change bytes outside the edited block.
- Changing the opened project preserves the interactive HTTP collection/environment.
- Private secrets do not appear in public files, exposed snapshots, or history.
- External conflicts are never silently overwritten.

### Phase 3 — response debugging and history (L)

Deliverables:

- JSON folding, search, wrap, line numbers, and paths.
- OSC52 copy/yank and protected text/binary saving.
- Redirect chain, environment-scoped cookies, and honest timing.
- Per-request history, opt-in persistence, and two-response diff.
- Global body budget and cleanup policy.
- Truncation controls and streamed full downloads.

Exit criteria:

- Large responses do not block navigation.
- Cookies/redirects respect domain, path, secure, expiry, and cross-origin removal.
- History diff works without persisting credentials or disabled bodies.
- Terminal control sequences are neutralized.

### Phase 4 — broader imports, assertions, and headless execution (XL)

Deliverables:

- Postman v2.0/v2.1/OpenAPI 3.x imports with compatibility reports.
- Declarative `.http` assertions and a results tab.
- Chaining without serializing extracted secrets.
- `tuiminal http run` with text/JSON/JUnit reports and documented exit codes.
- Local datasets and bounded collection concurrency.
- Compatibility fixtures and CLI/TUI integration.

Exit criteria:

- Equivalent preparation for the same request in TUI and CLI.
- Stable CI exit codes for parse, transport, and assertion failures.
- Deterministic imports that avoid overwrite and explain losses.
- Runner cancellation stops only its own children/connections, never unrelated processes.

### Phase 5 — advanced features with evidence (research)

Evaluate in this order:

1. OAuth2 with keychain storage.
2. Client certificates.
3. SSE streaming responses.
4. WebSocket mode within HTTP.
5. Isolated, permissioned scripting.
6. Schema-assisted GraphQL.
7. A separate gRPC proposal rather than an improvised HTTP-builder extension.

Require a use case, prototype, security model, and maintenance assessment. Competitor
support alone does not justify a feature.

## Test strategy

### Unit tests

- Layout thresholds, pane minimums, divider clamp/restore, grapheme-aware width.
- Reducer rejection of cancelled, late, old-revision, and other-tab responses.
- URLs/custom methods and CR/LF rejection in header names.
- Query/header ordering and duplicates.
- Body coercion, Content-Type, and auth.
- Variable precedence, cycles, unresolved values, and masking.
- `.http` parser/AST/round-trip, including quotes, comments, and multiple requests.
- Unix cURL quoting and safe representations on supported platforms.
- Bounded reads, split UTF-8, binary, compression, and truncation.
- Redirects, credential removal, and cookie matching.
- History budgets/redaction and protected writes.
- Folding, search, JSON paths, and diff.

### Local integration

Use an isolated ephemeral HTTP server for:

- 1xx/2xx/3xx/4xx/5xx statuses, HEAD, 204, and repeated headers.
- Same-origin/cross-origin/looping redirects.
- Slow headers and body streams.
- Cancellation, timeout, chunked, gzip/brotli, large bodies, and interrupted connections.
- JSON, form, multipart, and file uploads.
- Cookie domain/path/secure/expiry behavior.
- Local HTTP proxy and TLS with disposable certificates: strict verification fails;
  insecure mode requires approval before transport disables verification.

### Real TUI

- Click, focus, edit, send, cancel, and scroll.
- Complete `[Esc]` sequences through autocomplete, input, modal, sidebar, and app.
- Inputs/modals/pickers block global shortcuts while owning the keyboard.
- Framed/compact matrix from `60×16` to `160×40`, resizing across every breakpoint.
- Mounted tabs retain content, cursor, and response.
- Mouse and keyboard dividers.
- External collection changes and draft conflicts.
- All tutorial text/targets in six languages.
- Accessible/reduced-motion variant with static progress, linear focus, and
  understandable non-color state.
- AltGr, tmux/GNU Screen, VS Code Terminal, macOS selection/copy, and function-key
  fallbacks when those environments are available.

### CLI and gate

- Preserve parsing of `tuiminal http [directory]`; the interactive data remains global.
- Test `run`, reports, and exit codes without external network access.
- Import into temporary directories.
- Run `bun run check` and `git diff --check` for every delivery.
- Never read real user configuration, keychain, `.env`, or services in tests.

## Priority summary

| Item | Value | Risk | Decision |
| --- | --- | --- | --- |
| Focus, `[Esc]`, cancellation, limits | Very high | Medium | First |
| Posting-inspired layout | Very high | Medium | Phase 1 |
| Structured query/headers/auth/body | Very high | Medium | Phase 1 |
| Lossless `.http` and project collection | Very high | High | Phase 2 |
| Environments and private/keychain secrets | Very high | High | Phase 2 |
| cURL import/export | High | Medium | Phase 2 |
| Response search/folding/copy | High | Medium | Phase 3 |
| Persistent history and diff | High | High privacy risk | Phase 3, opt-in |
| Postman/OpenAPI | Medium | High | Phase 4 |
| Assertions/headless | High | High | Phase 4 |
| Multiple-language codegen | Medium | Medium | After cURL |
| Scripts | High for some cases | Very high | Deferred until isolated |
| WebSocket/SSE | Medium | High | Research after mature HTTP |
| gRPC/MQTT | Low in current scope | Very high | Outside immediate plan |

## Decisions that must remain explicit

- **Chosen:** Posting-inspired visuals adapted to Tuiminal conventions.
- **Chosen:** rebuild HTTP without copying its previous components, reducers, types,
  helpers, tests, or execution flow.
- **Chosen:** preserve only required public contracts (`active`, Runner-forwarded URL,
  keyboard scope, future shutdown) and reuse cross-cutting theme/i18n/OpenTUI/shared UI.
- **Chosen:** four constraint-based compositions: Panorama, Workbench, Focus, Minimum.
- **Chosen:** stable primary tabs and progressive disclosure; Params groups Query/Path;
  More holds rare features without moving controls.
- **Chosen:** persistent method/URL/environment/send/cancel omnibar and bounded contextual footer.
- **Chosen:** visual focus order, stable global meanings, and one-layer `[Esc]` at all sizes.
- **Chosen:** state independent of color/animation; accessible/reduced-motion target
  and linear headless output.
- **Chosen:** canonical versionable `.http`, with UI state stored separately.
- **Chosen:** the interactive HTTP home remains the same when the opened project changes.
- **Chosen:** interactive history remains in memory for the current session.
- **Chosen:** no implicit host-environment loading.
- **Chosen:** up to six mounted requests, matching SQL workspace limits.
- **Chosen:** label partial timing honestly; do not simulate DNS/TLS measurements.
- **Chosen:** scripts/additional protocols do not block the initial phases.
- **Prototype validation:** TypeScript/Bun lossless `.http` AST quality.
- **Prototype validation:** large JSON formatting/folding cost outside OpenTUI's input path.
- **Prototype validation:** Bun APIs for repeated `Set-Cookie`, trailers, streaming,
  and manual redirects on supported versions.

If validation fails, record the evidence and alternative here rather than hiding a
limitation behind an abstraction that promises more than it delivers. Read prototype
items against recorded progress, not as automatic new tasks.

## Program definition of done

The plan is implemented, beyond a new-looking screen, when:

1. Scratch, global interactive `.http`, environments, secrets, and history have clear boundaries.
2. Request/response workflows support keyboard and mouse in both layouts.
3. `.http` round-trips losslessly and runs in TUI and headless mode.
4. Response inspection, search, copy/save, truncation, and errors are accurate.
5. Cancellation, redirects, cookies, files, and persistence pass the security tests above.
6. Imports never silently overwrite and always produce a report.
7. New features do not break Database, Git, Runner, or Free Terminal.
8. README, AGENTS, shortcuts, translations, tutorial, and tests are updated per phase.
9. `bun run check` and `git diff --check` pass.
10. Manual auditing confirms `60×16`–`160×40`, compact/framed, mouse, drag, resize,
    and real `[Esc]` sequences.
11. Focus, status, dirty state, production, errors, truncation, and redaction remain
    understandable without color or animation.
