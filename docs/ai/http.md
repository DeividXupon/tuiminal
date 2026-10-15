# HTTP

Use for interactive/headless requests, collections, imports, privacy and Postman.
Code: [feature](../../packages/feature-http/src/).
Contracts: [Postman account](../design/postman-account.md),
[format/import fixtures](../../tests/fixtures/http/README.md).

[HTTP_CLIENT_PLAN.md](../../HTTP_CLIENT_PLAN.md) governs future redesign work,
not current behavior. Its from-scratch constraint applies to that rebuild;
reuse shared infrastructure/minimal app contracts, not prior feature internals.

## Storage and editing

- Interactive HTTP uses one global home under XDG data, independent of the opened
  project. `TUIMINAL_HTTP_HOME` is an explicit fixture/embedding override.
  Headless commands retain explicit file paths and roots.
- Collection mutations reject stale hashes, symlinks, non-HTTP folder contents
  and loss of dirty/running requests. Confirm deletion/discard/dirty exit.
  Conflict resolution uses a redacted diff; a removed block can only be copied.
- Interactive environment selection is global. New/edited values go to the OS
  credential store; the private file holds opaque references with atomic 0600
  writes. Missing credential storage fails closed. Existing public environments
  remain readable; legacy workspace defaults do not drive the interactive client.
- Unsupported .http directives/scripts/handlers/redirects stay exact raw read-only
  blocks: do not execute or partially reserialize them. Preserve the versioned
  compatibility fixtures, including timeout units and multiline syntax.
- Imports read bounded sources, preview, revalidate digest/path/destination and
  create exclusively under global imported/. Never overwrite source/project files,
  follow unsafe destination symlinks, fetch external refs or expose literal secrets.
- Postman is an explicitly linked local copy, not atomic live synchronization.
  Keep API keys in the credential store and fetched secrets out of project/.http
  files. Validate sidecar identity/conflicts, preserve unique block IDs and remote
  associations, and report local success/remote failure separately.

## Execution and privacy

- Individual sends and collections share dependency/assertion/extraction execution.
  Validate before transport; resolve dependencies topologically by stable IDs.
  Each run/download owns a synchronous guard and controller; stale results cannot
  publish or release replacements. Cancellation schedules no further cases.
- Path substitution affects pathname tokens only, encodes once and never rescans
  replacements. Preserve authority, query, fragment and environment syntax;
  normalize scheme-relative/backslash forms before substitution/validation.
- Carry non-serializable privacy context across redirects, chains and failures.
  Learn sensitive headers/cookies/extractions before reports; redact known values
  and common encodings without mutating the active raw response. Known-secret
  bodies stay volatile even with persistence enabled. Arbitrary bodies and old
  history/backups are not guaranteed scrubbed; export is a separate explicit action.
- Strip cross-origin credentials by provenance and known value; later hops cannot
  resurrect stripped cookies. Reject URL credentials/non-HTTP redirects.
  Pause the same transport for private-body/URL crossing, HTTPS downgrade or
  unapproved insecure TLS; reject on Escape/timeout/abort/unmount without replay.
- Redirect approval is single-hop and never restores stripped headers. TLS approval
  is session/target/environment scoped. Headless exact-origin redirect flags do not
  imply `--allow-insecure-tls`. Guard stale/repeated approvals and restore only
  the previous live focus owner.
- Cookie jars are directory/environment scoped, PSL/IDN validated and bounded.
  Ignoring the jar suppresses both reads and Set-Cookie writes. Proxy credentials
  remain private/redacted; every new insecure HTTPS target needs approval.
- Bound capture to 1.5 MB and live rendering to 50,000 characters, retaining all
  captured bytes for explicit save. Release reader locks and retire the fetch
  controller on completion/failure/truncation. Downloads finish short writes and
  check cancellation before exclusive protected publication.
- Desktop opening accepts only allowlisted raster MIME plus matching magic bytes;
  SVG/PDF/generic binary remain blocked. Inert save is separate.

## UI and verification

- Preserve document state/focus/response identity through resize and navigation.
  Key/value tables use layered block/table/cell focus; controlled onInput updates
  must not rewrite partial URL query drafts. Preview is redacted prepared state.
- Pretty JSON keeps raw response intact and caches shape/styled text across
  selection changes. Search/JSONPath owns focus until closed. Keep narrow controls
  inside actual viewport bounds; both split controls share the per-document ratio.
- Watch only supported files with bounded per-directory watchers; coalesce scans,
  reconcile once after attachment, and ignore disposed-root results. Tree collapse
  requires `viewportCulling={false}` to avoid stale OpenTUI rows.
- Tests: `tests/http-*.test.ts`, HTTP TUI suites and fixture compatibility matrices.
  Use local ephemeral servers/fake account clients. Redirect keyboard changes also
  run `TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts` on supported
  POSIX hosts. Wait for committed tabs, closed mutation forms and rendered geometry,
  not focus alone or fixed delays.
