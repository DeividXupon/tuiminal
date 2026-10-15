# Git

Use for local Diffs/Compare, GitHub dashboards, transport and mutations.
Code: [feature](../../packages/feature-git/src/).

| Change | Contract |
| --- | --- |
| Local files, diff, graph, staging | [Local Diffs/Compare](../design/git-pr-interface.md#local-diffs-and-compare), [partial staging](../design/git-pr-interface.md#partial-staging) |
| PR layout, focus and actions | [PR](../design/git-pr-interface.md) |
| Issue behavior and writes | [Issues](../design/git-issues-interface.md) |
| Notifications and saved threads | [Inbox](../design/git-inbox-interface.md) |

## Local operations

- Diffs stays offline. Its selected project/branch is independent of remote
  account/repository scope. Compare uses `base...compared` without checkout,
  fetch or uncommitted changes.
- Git status paths are literal: use `--literal-pathspecs` before subcommands;
  `--` alone does not disable pathspec magic. Discard confirms exact targets.
- Serialize stage/unstage, optimistically update, then reconcile status without
  losing selection/scroll. Partial staging rereads exact staged/worktree patches
  before `git apply --cached`; stale sources fail safely.
- The console invokes Git directly with argv, retains bounded output and completes
  only local/known refs. Partial staging contains focus and hides the console.
- Keep native diff buffers, gutters, split columns, header and footer stable.
  Horizontal scrolling moves code only; vertical movement retains its position.
  Parse added/removed header-like text by hunk context; compute intraline lazily.

## Remote reads and writes

- PR, Issues and Inbox own separate models, sessions and mutation workflows.
  Use existing shared dashboard/detail lifecycles and pure helpers only where
  ownership matches. Local project, account and repository scopes stay independent.
- Default to a recognized GitHub origin or authenticated account scope. A saved
  empty repository list means account scope, never unbounded GitHub-wide search.
- Query parsing uses `model/search-query.ts`; quoted text cannot supply qualifiers.
  Reject unfinished quotes on apply/request without losing the draft. Keep
  mandatory type/archive and structured scope filters outside user text.
- Bound caches (64 list/context, 32 detail entries), refresh LRU hits and clear on
  disposal. Validate exact request generation after every await before publishing
  or caching. Stale callbacks cannot release replacement controllers.
- Refresh and pagination must not race; background failures retain usable data.
  Watches own controller/timer generations and retire before notifications.
  Snapshot/clear retiring resource registries before running every disposer.
- Automated `gh` uses argv and bounded stdin, never shell interpolation, tokens
  or global account switching. Require every chunk callback and child exit;
  incomplete stdin with exit zero is still uncertain. Cancellation waits for the
  exact child, escalating only that child when necessary.
- Writes prepare identity, reauthenticate, reread eligibility, execute once and
  reconcile. Post-dispatch connection failures, timeouts and cancellation are
  uncertain: never retry automatically. Creation confirmation validates response
  host/repository/type/number; retain drafts after uncertainty.
- Checkout requires matching remote and clean worktree. Never automatically clone,
  stash, reset, clean or execute PR code. Merge/update/review pin the expected head.
  Node reactions and replies revalidate exact identity before dispatch.
- Guided install/login PTYs display commands for the user to run; never inject
  them or capture input. Poll readiness and retire only the owned shell.
- Persist only documented configuration/saved IDs with atomic restricted writes;
  keep remote bodies/drafts volatile. Migrate exact untouched defaults only.
  Browser opening validates HTTPS host and uses argv; terminal browsers own PTYs.
- Settings pickers replace the detail pane. Synchronous guards prevent duplicate
  operations; closing retires UI callbacks without undoing dispatched Git work.

Tests: `tests/git-*.test.ts`, `tests/github-*.test.ts` and Git TUI suites.
Use fake `gh` for remote I/O, disposable repositories for literal-path/index
assertions, and real child tests for stdin/backpressure/cancellation.
