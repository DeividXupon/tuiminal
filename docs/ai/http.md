# HTTP client

## HTTP client

- Postman account access imports an explicit linked local copy through `tuiminal postman` or the Postman source's `[O] Postman` browser. Read [the maintained account contract](../design/postman-account.md) before changing API key storage, remote reads, imported variables, or write behavior. A connected account opens an HTTP source chooser: Local excludes `postman/`, Postman shows only `postman/`; `[Ctrl+G]` returns to the chooser after dirty or running requests are resolved. Keep the API key in the OS credential store, do not pass it as a CLI argument, and never put fetched variable values in a project or `.http` file. A missing Postman Vault value remains unresolved with a warning. `[Ctrl+S]` writes the linked local file and sends the changed request to the API; a scratch request in Postman mode chooses a collection or folder before remote creation. Report local success and remote failure separately. Remote collection, folder, and request mutations require a valid association and reject detected conflicts. Do not present the copy as live or claim the separate read and write calls provide atomic conflict protection.

- The collection tree treats `.http`/`.rest` files as collections and directories as folders in the global HTTP home. Keep it keyboard-first: `[↑/↓]`/`[J/K]` move a visible selection, `[←/→]` collapse/expand or move to parent/child, `[Home/End]` jump, `[Enter]` opens a request or toggles a branch, `[N]` creates a request, `[Shift+N]` a collection, `[P]` a folder, `[E]` renames, and `[D]` starts confirmed deletion. Scope these keys to the focused collection pane, let text fields own their input, and keep the selection visible during scrolling, after mutations, and when returning from history. Show empty folders and files, keep mouse controls for the same actions visible in narrow panes, and confirm deletion. Reject stale file hashes, non-HTTP folder contents, symlinks, and mutations that would discard dirty or running open requests. Do not write to the opened project.

- The interactive HTTP workspace has one global home under `$XDG_DATA_HOME/tuiminal/http` (falling back to `~/.local/share/tuiminal/http`) and ignores the opened project's path. `TUIMINAL_HTTP_HOME` is only an explicit fixture/embedding override. Collections, settings, history, and global environments live there. Headless `.http` commands still use their explicit input/output paths and roots.
- Interactive Postman/OpenAPI import accepts one absolute source path or `~/` path from anywhere on the machine, offers bounded filesystem suggestions with `[↑/↓]` and `[Tab]`, and accepts the path pasted by a terminal when a file is dropped onto the import box. Detect Postman v2.0/v2.1 or OpenAPI 3.x from parsed content at preview time, show the detected format there, and do not require a manual format selector or filter autocomplete by the selected format. Keep the drop box as the large flexible center of the import modal, with the path and suggestions grouped above it and the action below it; preserve a usable drop target in short terminals. The import modal keeps its rounded border in both layouts; `panelBorder` removes borders in compact mode and must not be used for this dialog. Terminal mouse-drop events carry no file payload, so do not claim raw file transfer; support pasted absolute, shell-escaped, quoted, and `file://` paths. The source is read-only, and preview/confirmation writes a new `.http` only under the fixed `imported/` directory of the global HTTP home, never the opened project. Keep source digest/path and destination revalidation before write, the 8 MB source limit, no-overwrite creation, and the external-symlink guard on the destination. Headless import retains its explicit input/output paths.
- The environment manager lists global names, including the no-environment choice. Keep its navigation hints and mouse-accessible `[N]` creation button on one footer row, with shortcut tokens in the fixed brand blue; narrow terminals may omit trailing hints without splitting a shortcut. `[N]` opens a form with a distinct-background name input and alternating-background variable/value rows. `[/]` first selects between vertically arranged name and table blocks: `[↑/↓]` moves a left focus rail, and `[Enter]` enters the chosen block. An empty table focuses its first cell; a populated table enters arrow or `[H/J/K/L]` navigation with a distinct background on the selected cell. `[Enter]` edits a cell, `[Tab]` advances through inputs and adds a blank row as needed, and layered `[Esc]` returns from input to table navigation, then to the form. Do not add a separate back-to-environments shortcut or button in that form; the modal's `[Esc]` control owns the layered return. Environment values are visible in the editing table and every new or edited value goes to the operating system credential store; the private global file (atomic, mode `0600`) holds only opaque references for those values. The public file remains readable for existing environments but is never a creation target. If the credential store is unavailable, saving fails rather than writing plaintext. The modal keeps a complete rounded border in both layouts, takes focus from the workspace, suppresses underlying focus rails, and blocks pointer access to the workspace until it closes.
- Pretty JSON navigation reuses the parsed response and collapsed tree shape across selection changes. Keep the styled response document stable while selection moves; show a full-row accent highlight with a separate fixed tree-marker gutter, display the selected pointer in compact response chrome, and scroll the highlighted row into view. Rebuild only when the response, collapse state, or appearance changes. Navigable Pretty JSON stays unwrapped so logical lines, mouse selection, and the highlight align; offer Wrap in Raw or other response views instead.
- URL variable suggestions must be recomputed when focus returns to an unfinished URL after sending or visiting another pane; dismissing suggestions with `[Esc]` must still keep them closed until focus leaves or the text changes. OpenTUI emits `onInput` when React assigns a controlled input value, so URL-derived query cells must ignore these prop-synchronization events using the current entries; otherwise typing a partial name such as `?ma` rewrites it as `?ma=` before the user finishes.
- HTTP request key/value blocks (Query Params, Path Params, Headers, form URL encoded, and Multipart) use one layered table interaction. `[↑/↓]` or `[J/K]` selects the Query/Path block while Params is focused; `[Enter]` enters an empty block directly in its first name cell, or opens row/cell navigation when entries exist. In table mode arrows or `[H/J/K/L]` select rows and every visible control, including the enabled dot, Multipart text/file switch, name/value cells, and `[×]`. `[Enter]` activates the selected control (including deletion on `[×]`), `[Space]` toggles the row's enabled dot from any column, and `[D]` also deletes it; show a contextual `[Space]` hint. Multipart also uses `[T/F]` for text/file. `[Tab]` advances through editable cells, with one draft row after the saved entries that becomes real only when typed; draft rows do not expose action columns. `[Esc]` returns from cell to table, then block. Do not show or bind contextual `[N]` for adding these table entries; keep mouse access and alternating row backgrounds with a distinct selected-cell fill. Opening an empty table must not dirty the request before typing.
- HTTP home watching reloads collections/configuration/environments only for `.http`, `.rest`, the two supported environment files, and `.tuiminal/http/config.json`; unrelated edits must not trigger a full scan. Coalesce refresh requests while a scan is active and never apply a result after its workspace/root was disposed. Use bounded per-directory watchers and serialize reconciliation after renames: Bun 1.3.14 recursive watches can miss newly created descendants on macOS. Directory additions/removals trigger discovery so files created before watcher attachment are still found; unrelated file edits do not.
- Schedule one cancellable refresh after HTTP watcher attachment. `fs.watch` returning does not guarantee that native event delivery is ready, so initial file changes must also be reconciled without relying on a watch event; do not add polling or a registration sleep.
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
- Opening a captured HTTP response outside Tuiminal is limited to an explicit raster-image MIME allowlist with matching magic bytes. Keep SVG, PDF, generic binary and MIME/signature mismatches blocked from desktop handlers; saving remains available as a separate inert file action.
- Normalize URLs without a scheme to HTTP, add JSON content type when appropriate, retain a 30-second timeout, cap response storage around 1.5 MB, and keep up to 30 session requests.
- HTTP Path rows replace complete `:name` path segments or explicit `{name}` tokens within the pathname only. Preserve authority, query, fragment, encoded literals, and `{{environment}}` syntax; use the first enabled row for duplicate names and encode its resolved value once without rescanning inserted values.
- Path substitution and URL validation share protocol normalization. Preserve the authority of scheme-relative URLs and URLs with extra leading slashes, and recognize HTTP backslash path separators before matching tokens; query and fragment separators stay untouched.
- Editing fields, submitting, switching request/response panes, history navigation, cancellation, and response scrolling must work through keyboard and mouse.
- Request `Mais` has the stable local sections Opções, Assertions, Chaining, and Preview, cycled with `[Z←]`/`[V→]` while the request pane is focused. Assertions and extracted variables are first-class request state, round-trip through `.http`, and must be validated before save or transport. A custom HTTP token method is edited under Options; cycling away from a custom method returns to the known method list predictably.
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
- Request `Mais` includes Preview, which displays the exact prepared method,
  redacted URL, headers with inheritance origin, resolved variables, execution
  options, and bounded body before sending. Exiting the application while any HTTP
  draft is dirty requires a top-level confirmation and must suspend the HTTP layer.
- Request Options exposes `[C]` to include or ignore the cookie jar per request.
  Ignoring it must suppress both cookie reads and `Set-Cookie` writes, appear in
  Preview, and round-trip through the interoperable `# @no-cookie-jar` directive.
- The in-memory HTTP cookie jar validates ICANN and private domains with a maintained Public Suffix List, normalizes IDNs/IPs, enforces secure-prefix/lifetime/size/count/header budgets, and is isolated by request directory inside the global HTTP home plus selected environment. Collection dependencies may share cookies only inside that same scope.
- Request Options accepts an explicit HTTP/HTTPS proxy and uses `[Shift+V]` for TLS
  verification. Proxy credentials must come from private variables and remain
  redacted in previews, conflicts, cURL, reports, and transport errors. Insecure
  TLS is opt-in per request, appears literally in red, and requires `[I]` approval
  scoped to target, selected environment, and the current session; every new
  HTTPS redirect target requires its own approval. Headless runs require the
  explicit `--allow-insecure-tls` flag.
- `[E]` opens the HTTP environment manager. Interactive environment selection
  applies globally, including requests in collections; the manager writes only root
  `http-client.private.env.json` inside the global HTTP home, while still reading
  existing public environments. Existing per-directory resolution remains available
  to explicit headless `.http` runs. The older project-private writer retains its
  safety checks for those explicit file workflows.
- Interactive HTTP uses one global home regardless of the opened project. The
  environment manager lists selectable environments, supports create/edit/rename/
  delete, and has an always-active `Globals` variable form whose name cannot change.
  New and edited variable values remain visible in the form, live in the operating
  system credential store, and leave only opaque references in the private file. The old workspace-defaults
  screen and its persisted default environment, headers, timeout, redirects, and
  history preferences are not applied by the interactive client; history is in-session.
  Request-specific timeout and redirect controls remain available.
- Typing `{` in the HTTP URL shows available variable names without their values;
  `[Tab]` completes the selected name as `{{name}}`. Query pairs typed in the URL
  appear in Params, remain editable there, and are sent only once.
- `.http` compatibility follows JetBrains units and common syntax: a bare
  `@timeout` value means seconds, serialized values include `ms`, and `//`
  directives, `# @name =`, short GET, and indented multiline URLs are accepted.
  A block containing an unsupported directive, pre-request script, response
  handler, or redirect is read-only and must not be executed or partially
  reserialized as if Tuiminal understood its semantics. Open these blocks in a
  scrollable raw pane containing the exact original block; do not leave the visual
  builder or editable omnibar active for them. Keep the versioned compatibility
  matrix under `tests/fixtures/http/` aligned with the JetBrains syntax boundary.
- HTTP focus follows `route → collection → request → response`. `[Tab]`/
  `[Shift+Tab]` and `[H/L]` cycle those regions; Options no-log uses `[Shift+L]`
  so panel navigation stays stable. The five request tabs have no direct keyboard
  shortcuts. In a focused request pane with no editor owning input, `[A←]`/`[F→]`
  cycle Params, Headers, Body, Auth, and More, keep focus at pane level, and expose
  their mouse controls only while that pane is focused. In a
  focused Pretty JSON response, `[↑/↓]` or `[J/K]` select structural blocks,
  `[←/→]` collapse/expand and `[Enter]` toggles. Preserve selection and collapsed
  JSON Pointer paths per document, render the colored tree as one styled text
  document, and never mutate the captured raw response.
- Keep narrow HTTP panes clipped to their bounds. At low heights, compress the
  local `Mais` tab strip to one row, keep Options scrollable, and put its execution
  controls before metadata so keyboard and mouse actions remain reachable.
- HTTP More needs its compact padding and one-row tabs whenever the request pane is shorter than 14 rows, even while the pane title/footer remain visible. In a 10-row framed pane, normal More chrome leaves only a one-row viewport and places cookie/TLS controls outside it. Verify control bounds against the actual scroll viewport across resize and option updates; rendering outside a clipped viewport must not be treated as visibility.
- Keep large HTTP responses bounded twice: capture at 1.5 MB, then render at most
  50,000 characters in the live pane as one native text document. Show
  `TRUNCADO` in fixed response chrome; saving preserves all captured bytes and a
  safe full GET download remains a separate action.
- HTTP capture readers release their stream lock on completion, truncation and errors. Each fetch owns an AbortController retired after capture/failure: on Bun 1.3.14, reader cancellation alone can leave a continuous native transfer running. Regression servers must respect backpressure and stop their producer on socket close; Bun does not reliably emit ServerResponse.close. Empty chunks do not count as content or prove truncation at the byte limit; cancel only once additional bytes are observed. Keep response search line/column tracking incremental instead of splitting the preceding text for every match.
- Complete HTTP downloads have one synchronous operation owner per workspace. Closing the owning document or unmounting aborts it; changing the selected document alone does not. Late completions must not notify or release another operation. Always cancel/release the response reader on failure, finish short filesystem writes, and check cancellation before publishing the protected temporary file. Publication remains exclusive; cancellation cannot undo a GET already received by the server.
- HTTP collection runs own their exact controller and project scope. Reopening/resetting the runner or cycling its target retires and aborts the previous run before a replacement starts; root changes and unmount do the same. Repeated run/cancel input must not start parallel copies or schedule dataset cases after cancellation. Select a request by its stable ID, not its potentially duplicated display name, and ignore results from retired runs.
- The HTTP request/response split starts at equal 50/50 sizing in every simultaneous-pane layout and has both `[Ctrl+↑/↓]` buttons and a real mouse
  drag handle. Both routes update the same per-document ratio and keep it between
  25% and 70% across horizontal and vertical responsive compositions.
- The HTTP tutorial uses a simulated local workspace and response, with no
  project scan or network access. Keep stable targets for documents, omnibar,
  collection, request builder, automation/security, and response inspection, and
  cover every target and translation in regression tests.
- Postman v2.0/v2.1 and OpenAPI 3.0/3.1 import compatibility is recorded under
  `tests/fixtures/http/import/`. OpenAPI local `$ref`, parameter overrides, and
  root/path/operation servers are supported; external refs and lossy constructs
  must be reported without exposing their URLs or contents. Imported literal
  secrets use unique private-variable placeholders per request and field.
- In Postman source mode, choosing a workspace pulls only its missing linked
  collections and filters the tree to that workspace's sidecars. Keep the
  internal `postman/` path for storage but omit its row in navigation; show the
  workspace name above the list. Do not overwrite an existing linked copy when
  reopening the workspace. Keep the collection actions under `[?]` and preserve
  their keyboard shortcuts. Method colors follow Postman's hues with readable
  variants for light themes; request names use the theme text color and folders
  use muted gray. Keep collection-tree rows stable when folders toggle. Imported
  requests may share a display name; their `.http` block IDs and Postman sidecar
  keys must remain unique so tree rows, saves, and remote writes address the same
  request. Repair duplicate IDs in previously linked copies when reopening a
  workspace without changing request names or their remote associations. Start
  Postman collections and folders collapsed when opening a workspace; preserve
  local-tree expansion behavior. Set the tree scrollbox's `viewportCulling` to `false`
  explicitly; OpenTUI defaults it to `true`, which leaves stale rows after
  collapsing a large tree.
