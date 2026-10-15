# Git Inbox interface

Specification for the `[4] Inbox` workspace, inspired by gh-dash notifications
and adapted to Tuiminal's focus, safety, and responsive layout rules.

## Anatomy

```text
LOCAL · …/project           │ GITHUB · @viewer
[1] [C] DIFFS               │ [2] PR  [3] ISSUES  [4] INBOX
│ GITHUB INBOX                                                            │
│ Inbox 12  Review 3  Assigned 2  Mentioned 4  Saved 1                    │
├─────────────────────────────────────┬───────────────────────────────────┤
│ ▶ ● owner/api                       │ Fix cache invalidation            │
│   Fix cache invalidation · PR 09:10 │ owner/api · PullRequest           │
│   ○ owner/web                       │ [O] Open [M] Read [B] Save        │
│   Adjust focus · Issue yesterday    │ [D] Done [U] Unsubscribe          │
│   ◷ Loading more notifications…     │                                   │
└─────────────────────────────────────┴───────────────────────────────────┘
 [J/K] Navigate  [H/L] Focus  [A←] [F→] Section  [R] Refresh
```

## Behavior

- In framed mode, title, sections, and panels are adjacent on one continuous
  panel-colored surface. Compact mode retains its existing geometry and canvas
  background.
- Wide (`≥92 × 20`): list and preview side by side. Smaller terminals use one pane,
  with `[L/→/Enter]` for preview and `[H/←]` for the list.
- `[A←]`/`[F→]` cycles sections; both controls also accept mouse input.
- Selecting the last loaded item starts the next page once. The loader belongs to
  the scrollbox and disappears when the page is merged.
- Periodic refresh rereads from the first page through the deepest page reached.
  Selection and visible data remain stable during the request.
- The header shows refresh state only while a request is active, without permanent
  explanatory copy for automatic behavior that cannot be disabled.
- Unread items use `●`, read items `○`, and saved items `★`. PR/Issue marks take
  the subject state color: open green, merged purple, draft gray, closed red.
  A localized text label repeats the state. Other subjects or unavailable states
  stay neutral, while filled/hollow shapes keep read status distinct.
- Rows reuse formatting while notification, width, language, and saved state remain
  unchanged. Navigation, loader animation, and palette changes do not recompute
  dates/truncation; styling and controls remain current.

## Actions and layers

- `[O]` opens the selected notification through the Git-wide browser choice.
  The system-browser default uses the corresponding `gh` PR/Issue command or
  repository-pinned `gh browse`; Browsh, Carbonyl, and terminal-browser receive
  the validated HTTPS subject URL. See [Git configuration](./git-pr-interface.md).
- `[M]` marks a thread read and keeps its row.
- `[B]` toggles local saving without changing the GitHub subscription.
- `[D]` and `[U]` open a confirmation stating target and consequence. `[Ctrl+S]`
  confirms; `[Esc]` closes only that modal.
- The tab mounts only on first access and is disposed with other Git resources
  during shutdown.

## States and limits

Loading, empty, `gh` requirements, configuration/API errors, pagination, and refresh
are separate states. Page size and interval reuse PR-profile defaults rather than
introducing competing configuration for the same host. Remote content stays in
memory; only saved IDs go to disk. The host follows GitHub settings opened through
`[,]` in the Git screen; a change invalidates cache when Inbox becomes active again.

Initial loading uses full-panel ASCII plasma behind a readable message and dissolves
quickly into the list. Pagination and refresh do not cover loaded content. Missing,
outdated, or unauthenticated `gh` uses the same guidance and mini terminal as PR/Issues.
`[C]` copies the command; `[Enter]`/mouse focuses the shell for the user to paste and
execute. A valid version/login reloads the screen automatically, without Tuiminal
reading tokens or executing displayed commands. The PTY receives emulator protocol
responses, and `[Enter]` reopens an exited shell.

## Transport and persistence

- Reads use REST `notifications?all=true` on the authenticated PR-profile host.
  Inbox does not reuse PR/Issue search filters as thread scope.
- Notification pages do not contain PR/Issue state. After rendering the page,
  Inbox resolves only validated subject URLs through repository-pinned read-only
  `gh api` calls with bounded concurrency. These reads have separate cancellation,
  a 128-entry short-lived cache, and generation checks; failures keep the list
  usable with a neutral mark and never request a URL supplied by the payload.
- `[M]` uses `PATCH notifications/threads/{id}`; `[D]` uses `DELETE` on that resource;
  `[U]` uses `DELETE notifications/threads/{id}/subscription`. Pin host and thread
  ID in confirmation. Execute once: timeout/cancellation after dispatch produces
  an uncertain result, not permission to retry automatically.
- Only saved IDs persist in `$XDG_CONFIG_HOME/tuiminal/git-inbox.json`, falling back
  to `~/.config/tuiminal/git-inbox.json`, using atomic writes and mode `0600`.
  Bodies, caches, tokens, and notification content never go into this file.
- Each session owns its cancellation and resources. Disposing one cannot remove
  registrations or publish responses belonging to a replacement session.

## Maintained verification

`bun run check` includes `tests/git-inbox.test.ts`, `tests/tui/git-inbox.test.tsx`,
`tests/tui/git-inbox-formatting.test.tsx`, and `tests/git-resource-disposal.test.ts`.
Remote calls use fake `gh` and temporary state. Inbox is outside the simulated Git
tutorial, which covers Diffs and Compare.
