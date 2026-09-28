# Database

Use for connections, SQL, grid state, privacy and staged writes.
Code: [feature](../../packages/feature-database/src/).
[Architecture](../architecture.md#existing-separations) maps ownership;
[Database priorities](../plans/database-next.md) describe future work only.

## Connections and reads

- Start unconfigured. Native MySQL/MariaDB, PostgreSQL and SQLite are supported;
  optional MCP is explicitly opt-in/read-only. Environment URLs are discovered
  session profiles, not editable saved connections.
- Store connection metadata/favorites in restricted `databases.json`; passwords
  belong in the OS credential store. Decode URL passwords once and clear stale
  session passwords on rediscovery. Temporary test clients close on every path;
  cleanup failures do not replace the original error.
- Read/write access is opt-in per connection. PostgreSQL reads use a pinned READ
  ONLY transaction; MySQL/MariaDB also set the same session's READ ONLY default
  because DDL can commit. Restore the exact default or invalidate the pool.
  SQLite editor reads always use readonly handles.
- Unknown routines/syntax, effectful EXPLAIN, executable comments and state-changing
  PRAGMAs require RW plus confirmation. The app is not a sandbox for server routines;
  use least-privilege credentials and MCP-enforced read-only access.
- SQLite editor queries run in an owned child, reused while idle up to 30 seconds.
  Cancellation kills only the executing child; shutdown awaits all owned children.
  Keep worker and service result metadata normalization shared.
- Schema reads share pending work and an LRU of at most 256 tables. Writes/close
  invalidate completed and pending generations; stale reads cannot repopulate it.
  Use loaded schema for diagrams and avoid N+1 metadata queries.

## Writes and privacy

- Editable results require a direct, unique projection from one unambiguous catalog
  relation. Expressions, renames, duplicate fields, mixed wildcards or mismatched
  metadata fail closed. Update/delete require every primary-key field.
- Stage writes until review and explicit second approval of exact SQL; apply the
  approved connection-scoped batch in one native transaction with full rollback.
  Acquire synchronous in-flight guards before dispatch, not React busy state alone.
- Batch selection may export rows without keys, but cannot write them. Index staged
  targets once by connection/table/primary key, preserving original snapshots,
  order and approval reset. Distinguish exact BigInt keys from strings.
- Preserve DECIMAL/NUMERIC/DEC/FIXED/MONEY as decimal strings through staging and
  binding; never round through Number. REAL/FLOAT/DOUBLE remain approximate.
- Sensitive values start visible; masking is explicit and revealing needs approval.
  Matching uses literal normalized column fragments; an empty list disables it.
  Clear selected snapshots on visibility changes before any export.
- New SQL history persists metadata only. SQL, diagnostics and parameters stay
  in the bounded volatile cache (200 entries/2 MB); favorites explicitly save SQL.
  Preserve target isolation and normal write approval on rerun; staged changes
  cannot rerun. Legacy cleanup needs its own confirmation and does not erase backups.
- Retain the latest 100 read metadata entries and 184 days of writes. Resolve
  targets outside history loops; never persist redacted SQL as executable text.
- Exports use current columns, bounded preview serialization and protected files
  under launch-directory `tuiminal-exports/` only on explicit action. Data is
  neither UI-translated nor shortcut-highlighted. Query notifications hide literals.

## UI and verification

- Table history and SQL editors each keep at most six tabs. Preserve mounted SQL
  buffers/cursors/results across hiding, maximizing and appearance changes;
  inactive tabs do not own keys. Connection switches cannot execute old-target SQL.
- Statement-at-cursor parsing respects quotes, comments, backticks and dollar quotes.
  Keep SQL highlighting/autocomplete independent of service I/O.
- Table/query grids retain 50 rows, shifting 40 with 10-row overlap. Preserve
  absolute selection, readable columns and inline loading; grid keys move selection
  rather than independent scroll. Masking, sorting and staging invalidate affected
  memoized rows without remounting editors.
- Range selection uses `[Alt+Space]`, not `[Shift+Space]`; `[Esc]` clears
  selection before leaving. Do not restore visible-page select-all. Layered
  horizontal navigation performs local movement before crossing pane boundaries.

Tests: `tests/database-*.test.ts`, `tests/sql-*.test.ts` and Database TUI suites.
Prioritize read-policy, result provenance, history privacy and transaction tests;
use the opt-in [native driver matrix](validation.md#checks) for driver changes.
