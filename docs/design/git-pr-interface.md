# Git Diffs and PR — maintained specification

Status: implemented interface with local regression coverage; visual references
reviewed on 2026-09-04. This document holds the workspace specification and durable
contracts rather than retaining a separate completed plan. The Diffs/PR shell,
responsive dashboard, five preview tabs, remote diff, actions, CI, configuration,
and tutorial are implemented. Deliberate differences from gh-dash remain documented
to prevent copying its shortcuts without considering Tuiminal's conventions.

## 1. Visual reference and fidelity

The reference is **gh-dash's PR interface**, rather than its website layout:
horizontal sections, query search, dense rows, highlighted selection, contextual
preview, and a short footer. Tuiminal does not embed gh-dash in a PTY or reproduce
its branding.

The two images below were inspected on the official site. They are remote reference
images, not Tuiminal screenshots or locally generated mockups. At review time the
site advertised v4.25.2 while the Tokyo Night screenshot showed v4.16.2. Images guide
composition; documented capabilities and shortcuts must be checked separately.

### 1.1. Official list and preview

![gh-dash: horizontal sections, list on the left, preview on the right](https://www.gh-dash.dev/_astro/tokyo.C3tzrPg-_Z1SRz4H.webp)

Observed composition, deliberately omitting sample data:

- Top strip with section names/counts and an emphasized active section.
- Query directly above the table, showing the active filters.
- Rows with PR identity, title, and compact review/CI/change signals.
- Tuiminal keeps distinct state glyphs, colored green for open, purple for merged,
  muted gray for draft, and red for closed; the text and shape remain readable
  without color.
- Full-width row selection rather than a separate card for each PR.
- Simple vertical divider; preview shows identity, title, state, and branches.
- `Overview`, `Checks`, and `Activity` organize details.
- Collapsible description followed by additional information in the same pane.
- Footer showing context, refresh state, selection position, and help.

Source: [official gallery](https://www.gh-dash.dev/).

### 1.2. Official help

![gh-dash: dense help arranged in shortcut columns](https://www.gh-dash.dev/_astro/help.BFU_n1Fw_1cNf5p.webp)

The screenshot includes custom commands. Do not copy these bindings as defaults:
one example merges with administrative bypass. Tuiminal provides **no automatic
administrative bypass**.

## 2. Documented gh-dash anatomy

| Region | Documented behavior | Source |
| --- | --- | --- |
| Sections | Each has a title and filters; may override limits and layout. | [PR Sections](https://www.gh-dash.dev/configuration/pr-section/) |
| Search | Edits the section query; `[Enter]` applies; temporary edits do not change configuration. | [Global](https://www.gh-dash.dev/getting-started/keybindings/global/) |
| Table | Configurable width, growth, alignment, and visibility; title takes remaining width. | [Layout](https://www.gh-dash.dev/configuration/layout/pr/) and [options](https://www.gh-dash.dev/configuration/layout/options/) |
| Preview | Right, bottom, or automatic placement; can be hidden. | [Defaults](https://www.gh-dash.dev/configuration/defaults/) |
| Navigation | `[J/K]` or arrows select PRs; `[H/L]` or horizontal arrows change sections; `[Home/End]` reaches ends. | [Navigation](https://www.gh-dash.dev/getting-started/keybindings/navigation/) |
| Preview keyboard | `[Shift+P]` changes placement, `[P]` visibility, `[Ctrl+D/U]` pages, and bracket keys change internal tabs. | [Preview Pane](https://www.gh-dash.dev/getting-started/keybindings/preview/) |
| Actions | Contextual assignment, comment, and approval editors; other operations target the selected PR. | [Selected PR](https://www.gh-dash.dev/getting-started/keybindings/selected-pr/) |
| Extensible help | Built-in commands for navigation, preview, copying, actions, and check watches. | [Keybindings](https://www.gh-dash.dev/configuration/keybindings/) |

Reviewed defaults included 20 PRs per page, a right preview at 45% width, and automatic
placement. The defaults page disagreed about bottom height: example/table said 0.60,
while prose said 40%. Do not treat that inconsistency as a verified measurement;
Tuiminal's own criteria follow.

## 3. Adaptation to Tuiminal

| Retain from gh-dash | Adapt deliberately |
| --- | --- |
| Horizontal sections | Place them inside Git → `[2] PR`, without a permanent repository sidebar. |
| Row-based main table | Offer one-/two-line density and responsive columns. |
| Right/bottom preview | Add a single-pane mode when two useful panes cannot fit. |
| Overview, Checks, Activity | Localize labels and add Commits and Files. |
| GitHub query filters | Add visual section editing and saving. |
| Familiar action shortcuts | Keep `[H/L]` for pane focus and `[A←]`/`[F→]` for sections. |
| Compact review/CI signals | Include text/legends and unknown states, not color alone. |
| Contextual help | Group navigation, reads, and writes, with clickable actions. |

Use Tuiminal's logo, palettes, and `ShortcutText`/`InlineButton` key styling in
`#4B75FF`. Titles, Markdown, diffs, and branch names are data: their brackets do not
receive shortcut styling. Support all six UI languages.

## 4. Conceptual wireframes

These diagrams use fictional data and are not pixel-for-pixel copies of the official
images. Final dimensions must be checked in the native renderer.

### 4.1. Wide terminal — main structure

```text
◆ TUIMINAL [Alt+1] Database [Alt+2] Git [Alt+3] Runner [Alt+4] HTTP [Alt+5] Terminal [,] Settings
GIT [1] Diffs [2] PR [3] Issues [4] Inbox       github.com · @viewer
[A←] My PRs 12 │ Review requested 4 [F→]
[/] is:open review-requested:@me             Scope: all account projects
───────────────────────────────────────────┬──────────────────────────────────
   Repo       PR / Title          Rev CI ± │ team/api #142
▶  api        #142 Fix cache        ?   ×   │ Fix cache
   web        #87 Adjust navigation ✓   ✓   │ OPEN · main ← fix/cache
   infra      #31 Update image      ?   ◷   │ @ana · 2h · +32 / -11
                                           │ Overview Checks Activity Commits …
                                           │──────────────────────────────────
                                           │ Markdown description…
                                           │ [E] Expand description
                                           │
                                           │ Reviewers: @rui pending
                                           │ Code owners: @team/api pending
                                           │ Checks: 1 failed · 2 passed
───────────────────────────────────────────┴──────────────────────────────────
[J/K] Navigate [Enter] Preview [O] Browser [D] Diff [?] Actions    1/4 · 30s ago
```

Blank list space represents a short result set, not reserved footer height. Longer
lists fill all usable rows. Search, titles, and tabs must not reserve empty lines.

Local, comparison, and PR diffs share the code viewport. In the focused pane,
`[Shift+H/L]` or `[Shift+←/→]` scrolls horizontally; clickable controls occupy a
reserved lower-right row. Gutters and backgrounds remain fixed. Both split columns
stay visible and scroll together. Vertical navigation preserves horizontal position;
leaving the diff or changing the file/layout resets it to the left.

### 4.2. Medium terminal — preview below

```text
GIT [1] Diffs [2] PR [3] Issues [4] Inbox   github.com · @viewer
[A←] My PRs 12 │ Review requested 4 [F→]
[/] is:open review-requested:@me
   Repo      PR / Title                          Rev CI
▶  api       #142 Fix cache                       ?   ×
   web       #87 Adjust navigation                ✓   ✓
───────────────────────────────────────────────────────────────
team/api #142 · OPEN · main ← fix/cache
Overview │ Checks │ Activity │ Commits │ Files
Description…                     Reviewers and code owners…
───────────────────────────────────────────────────────────────
[Enter] Preview [P] Hide [Shift+P] Position [?] Actions
```

### 4.3. Narrow/short terminal — one pane at a time

```text
GIT [1] Diffs [2] PR [3] Issues [4] Inbox
[A←] Review requested · 4 [F→]
[/] review-requested:@me
▶ #142 Fix cache
  team/api · @ana · CI failed
  #87 Adjust navigation
  team/web · @rui · approved
[Enter] Open [?] Actions
```

Opening preview replaces only list content; `[Esc]`/`[H/←]` returns to the same row
and offset. Git sections stay accessible. At extreme widths, hide unfocused query
text while retaining the search action and filter state.

### 4.4. Preview tab content

| Tab | Content and interaction |
| --- | --- |
| Overview | Full title, URL, collapsed/expanded description, author, assignees, branches, labels, change summary, reviews, and requested code owners. |
| Checks | Name, provider, run/attempt, state, duration, URL; watch, stop watching, and review eligible authorizations. |
| Activity | Ordered comments, reviews, requests, and events; explicit pagination, comment selection, reactions, and replies. |
| Commits | Short SHA, message, author, date; select a commit, copy its full SHA, and open its diff. |
| Files | Path, additions/deletions, change type; select a file and open its diff. |

Only PR identity stays fixed; other content scrolls in the remaining area. Overflowing
tabs use horizontal controls rather than clipped labels. `[Z←]`/`[V→]` cycles internal
tabs; numbers belong to Diffs/PR/Issues/Inbox.

### 4.5. Diff

A focused PR mode contains a small file list and diff document. Offer unified,
side-by-side when space permits, and intraline layouts using shared internal Git
rendering without local-only dependencies.

Character comparison is lazy and cached per document, with no intraline work for
other layouts. The parser distinguishes file headers from hunk content: lines
starting with `++` or `--` remain visible and contribute correctly to viewport
height. The same rule applies to local partial staging, without exposing staging
in remote diffs.

- Show repository, number, and the actual displayed base/head SHAs.
- Provide file/hunk navigation, line numbers, and context.
- Distinguish renamed, binary, deleted, generated, and truncated files.
- `[Esc]` returns to preview, then list, never jumping to Diffs or exiting the app.
- Keep local staging actions out of remote PR diffs.
- Incomplete diffs offer browser access to the file/PR rather than implying completeness.

### 4.6. Forms and confirmations

PR creation opens from `[Ctrl+N]` or its mouse control, independently of list
selection. The form chooses an explicit `owner/repository` from the searchable
authenticated repository catalog, then remote base and compare branches in that
repository, title, Markdown body, and draft flag. The repository picker retains
the current valid selection while the catalog loads and can retry a failed read.
It renders at most 100 matching rows at once and lets search reach the rest.
Closing it cancels the catalog request. Both branch
controls open a searchable list from the selected repository's remote branches,
loaded in bounded pages on demand. Changing the repository clears both selections;
closing the picker cancels its read. Selecting the compare branch reads the latest
remote commit subject and suggests it as the PR title. A changed repository or
compare branch retires the previous read; late results cannot replace a newer
selection or a manually edited title. Failure leaves the title editable and does
not block creation. The compare selection maps to GitHub's `head` field on
submission. It never pushes
or checks out a local branch. `[Ctrl+S]` validates the form, rereads authentication,
repository identity, and both branches, then sends one JSON request through `gh api`.
Only a response with the matching host, repository, PR path, and number confirms
creation. An error after dispatch is uncertain and must not trigger automatic replay;
the form retains its draft until the user verifies GitHub. Empty/account-scoped
lists can still open it.

```text
┌ Approve PR ──────────────────────────────────────┐
│ github.com · team/api #142 · account: @reviewer  │
│ Fix cache · commit 9ab13cd                       │
│ Comment                                          │
│ Reviewed and approved.                           │
│                                                  │
│ [Ctrl+S] Approve  [Esc] Unfocus/Back             │
└──────────────────────────────────────────────────┘
```

- Use this pattern for comments, assignees, merge, close/reopen, and ready-for-review.
- Reactions show five numbered buttons (👍 ❤️ 🎉 😄 👀), counts, and the viewer's
  existing reaction. A comment with reactions offers a new reaction (`[E] Nova reação`
  in Portuguese). Replies show the target and create a flat comment with a validated
  link and author mention. Reading hides this marker and nests replies under their
  parent; completed writes reload selected details.
- Approval comments may have configurable initial text, but opening a modal or
  loading a template never submits it.
- Merge shows method, head SHA, blockers, CI, queue, and remote effect; no admin
  bypass or automatic branch deletion.
- Update branch explains merging base into head and possible conflicts.
- Workflow approval identifies code origin, actor, and the run being authorized.
- `[Esc]` first unfocuses input; another closes the layer. Preserve drafts in memory
  or ask before discarding; never lose them silently.
- Confirmation keeps its PR identity during background list refresh.

### 4.7. Section editor

In Git, `[,]` opens contextual settings. The GitHub option opens one manager for
PR selectors, Issue selectors, and repositories. Forms expose name, filters, order,
limit, and columns, plus save, rename, duplicate, reorder, and delete. Deleting a
section never closes PRs or removes local/remote repositories. Only saving promotes
a temporary query into persisted configuration.

Local projects and remote repositories publish independently with their own loading
and error states. Closing/reloading cancels the previous remote read; stale results
do not affect the current screen. Repeated local picker activations while a selection
is pending do not dispatch more operations. Closing via `[Esc]`, button, or outside
click retires that instance: its result cannot close a later picker. Internal controls
remain clickable. Closing UI does not cancel or undo an already-started Git operation.

New profiles start with `My PRs`, `Review requested`, `All`, `Open`, and `Closed`.
State filters select non-archived PRs within the current scope; preset names remain
English across all UI languages.

Queries retain spaces and escapes inside quotes; literal qualifier text cannot
change scope. Missing closing quotes produce translated guidance without submitting.
The draft stays editable and focused in the same modal. Both `[Enter]` and `[Ctrl+S]`
use this validation.

## 5. Responsive contract

Measurements are terminal cells, not pixels. These are **Tuiminal design starting
points**, not screenshot measurements or verified performance promises.

| Usable area | Composition |
| --- | --- |
| List ≥80 columns, separator, and preview ≥48 fit | Right preview, initially about 45%, constrained by minimums. |
| Side-by-side does not fit, but list ≥6 rows and preview ≥8 fit | Bottom preview, initially half the available height. |
| Neither split satisfies minimums | Single pane with contextual return. |
| Preview hidden | Table takes all usable width and height. |
| Below 40×10 | Readable minimum state, without partly visible dangerous actions. |

Subtract actual global chrome, framed borders, query, and footer; do not rely only
on `terminal.width < N`. Recalculate after language changes. Honor preferred right/bottom
placement when it fits, temporarily use a viable mode otherwise, and restore the
preference when enlarged.

Column priority: identity/title → state and CI/review → repository → author → changes
→ update/comments → assignees/base/labels. Multi-repository lists never omit the
repository: move it to the second row. Preview retains all fields hidden in the table.

## 6. Keyboard, focus, and mouse

Distinct modified actions are written as `[Shift+letter]`, avoiding ambiguity
between comment and checkout. Shared GitHub CLI installation/update/login panels
show guidance beside a mini terminal. `[C]` copies the fixed command, `[Enter]`
focuses the shell, and `[R]` checks again, with equivalent mouse controls. No shortcut
executes the suggested command: the user must paste/type it. Tuiminal detects version
or login completion and reloads the remote view. User input and emulator protocol
responses reach the PTY; `[Enter]` reopens an exited shell without stale callbacks.

| Context | Key | Action |
| --- | --- | --- |
| Git without editor/modal | `[1]` / `[2]` / `[3]` / `[4]` | Diffs / PR / Issues / Inbox, preserving state. |
| PR without editor/modal | `[A←]` / `[F→]` | Previous / next section. |
| List | `[J/↓]` / `[K/↑]` | Next / previous PR. |
| List | `[G/Home]` / `[Shift+G/End]` | First / last loaded PR; indicate pagination. |
| List | `[L/→]` / `[Enter]` | Open and focus preview. |
| Preview | `[H/←]` | Return to list; leave focused diff first. |
| Preview | `[J/↓]` / `[K/↑]` | Scroll or navigate commits/files/checks. |
| Panes | `[Tab]` / `[Shift+Tab]` | Cycle focus regions; inputs retain their own navigation. |
| Preview outside editor | `[Ctrl+D]` / `[Ctrl+U]` | Page content; never submit forms. |
| PR outside editor | `[P]` / `[Shift+P]` | Toggle preview / placement. |
| Preview | `[Z←]` / `[V→]` | Previous / next internal tab. |
| Overview | `[E]` | Expand/collapse full description. |
| PR | `[/]` | Edit query; `[Enter]` applies, `[Esc]` unfocuses. |
| PR | `[R]` | Refresh configured sections at their loaded depth, preserving identity. |
| PR | `[O]` | Open PR in browser. |
| List/overview | `[Y]` / `[Shift+Y]` | Copy number / URL. |
| Commits | `[Y]` | Copy the selected commit's full SHA; update footer label. |
| PR/file/commit | `[D]` | Open the context's diff. |
| PR | `[Shift+C]` | Prepare local checkout. |
| `[?]` menu | `[A]` / `[Shift+A]` | Add / remove assignees without conflicting with sections. |
| PR | `[C]` / `[V]` | Comment / approve with editable comment. |
| PR | `[Shift+E]` | React to PR with one of `[1]`–`[5]`. |
| Activity | `[J/↓]` / `[K/↑]` | Select comments. |
| Selected comment | `[E]` / `[Enter]` | React / reply. |
| PR | `[W]` | Toggle CI watch. |
| Checks | `[Ctrl+A]` | Review eligible workflow authorizations. |
| PR | `[U]` / `[Shift+W]` | Update from base / mark ready for review. |
| PR | `[M]` / `[X]` / `[Shift+X]` | Prepare merge / close / reopen. |
| Git | `[,]` → GitHub | Manage PR/Issue selectors and shared repository scope. |
| PR | `[?]` | Help and all actions with availability/reasons. |
| Form | `[Ctrl+S]` | Confirm only the displayed operation. |
| Local layer | `[Esc]` | Unfocus, close one layer, and restore focus. |

Unlike gh-dash section navigation, Tuiminal uses `[H/L]` for focus and `[A←]`/`[F→]`
for sections. PR actions target only the active PR, never a batch. See
[Issues](./git-issues-interface.md) for its separate workspace.

Mouse supports sections, tabs, rows, actions, and scrolling under the pointer.
Clicking a comment/assignee does not mutate anything. Expose all operations in `[?]`;
unavailable shortcuts do nothing and explain why. Inputs retain numbers, letters,
punctuation, `[Q]`, `[Ctrl+A]`, and `[Alt+1]`–`[Alt+5]` rather than forwarding them
to global navigation.

### 6.1. GitHub CLI requirement

Missing `gh` or a version below 2.40.0 replaces dashboard content with responsive
guidance and a mini terminal: side by side when wide, stacked when narrow. The
detected official command stays visible for `[C]` copying. `[Enter]`/click focuses
an empty PTY shell for the user to paste and execute. Tuiminal never injects or runs
installation commands. `[Esc]` releases terminal focus; periodic detection reloads
when a compatible version is available.

Missing login provides the same guidance for `gh auth login --hostname <host> --web`,
without reading/persisting tokens or PTY input. Unmount stops only the panel-owned
shell; its late exit cannot detach a replacement.

Automated calls outside that PTY have a separate lifecycle. Already-cancelled requests
spawn nothing; timeout/cancellation waits for the exact helper to close. Stdin pipe
errors do not crash the TUI. A successful-looking exit with incomplete input leaves
a write uncertain, without replay. CI watches cancel reads on stop/unmount and ignore
responses/timers from older instances, even when watching the same identity/SHA again.
Notification failure cannot restart a completed watch.

Detail pagination releases its indicator on PR changes. Repeated actions in one
batch issue one request; explicit refresh supersedes pending pages and initial
debounce. Responses, failures, and callbacks from another selection cannot replace
current details. Cache identity includes update time so discussion changes reload
without a new commit; cancelled/disposed requests cannot populate it.

Checks runs use the same ownership rule: changing selection/head immediately hides
old runs/errors. Late responses cannot offer another PR's authorizations. List row
formatting is reused while navigating; language, width, columns, or changed data
invalidate it without freezing colors or mouse handlers.

## 7. Distinct screen states

| State | Representation and next action |
| --- | --- |
| Missing/incompatible `gh` | Installation/update guidance and recheck; Diffs remains usable. |
| Missing login/pending SSO | Identified host, official authentication guidance, recheck; never request a plaintext token. |
| No local repository | PR uses authenticated account scope without setup; Diffs can select a local repository. |
| No results | Visible query/scope, filter editing, refresh; distinguish from errors. |
| Loading | Full-panel plasma on initial load; preserve existing rows during refresh. |
| Partial error | Identify failed section/repository/page; never present incomplete results as complete. |
| Offline/rate-limited | In-memory data with age, reason, and next possible retry time. |
| Insufficient permission | Preserve available reads; disable actions with explanations. |
| Removed/inaccessible PR | Do not retarget the next row; explicitly close the detail. |
| Head changed during review | Mark stale content; reload and reconfirm commit-bound actions. |
| No checks | Show “No checks,” not green success; query failure is “Unknown.” |
| Action in flight | Block repetition and show target/progress; navigation starts no new operation. |
| Uncertain remote result | Require state verification before retrying; do not assume success or resend comments. |
| Notification unavailable | In-app toast and explanation of terminal/OS limitations. |

## 8. Visual acceptance criteria

- [x] Recognizable gh-dash composition without an extra permanent sidebar.
- [x] List/preview fill usable space without overlapping footer, final row, or input.
- [x] Test 40×12, 60×18, 80×24, 120×30, 160×45, and 220×60 in both layouts.
- [x] Repeat extremes in Brazilian Portuguese, English, Spanish, Japanese, Chinese, and Korean.
- [x] Contextual footer fits without showing every action simultaneously.
- [x] Distinguish focus, selection, drafts, failures, pending, and unavailable states beyond color.
- [x] Fast navigation cannot retarget preview through a late response.
- [x] Resize preserves PR, internal tab, reading position, and edited text.
- [x] Exercise keyboard/mouse sequences with the native test renderer.
- [x] Compare character frames to references and record deliberate differences.

Recorded evidence: `tests/tui/git-pr.test.tsx` exercises mouse navigation through
Git tabs, sections, rows, preview tabs, and actions; side/stacked/single-pane layouts;
and a 44-case matrix of sizes, six languages, four palettes, and two chrome modes.
Character-frame inspection is deterministic and independent of pixels or font.

Confirmed differences: Diffs/PR/Issues/Inbox belong to Tuiminal's Git tool; `[H/L]`
moves focus, `[A←]`/`[F→]` switches sections; Commits and Files extend the three
main preview tabs; a visual section manager and single-pane mode are available;
admin bypass and automatic branch deletion are absent.

### Local Diffs and Compare

`[1] [C] Git · Diffs` uses only an available local repository. The header shows
project/branch and `[Ctrl+P]` selection; the same control is the first tab in Git
settings opened with `[,]`. Changing this target does not change remote scope,
which may include repositories without a local clone.

`[C]` toggles that tab to Compare. Before results, three centered cards select the
project, base branch, and compared branch. Once complete, wide layouts show
`[project] [base] → [compared]` in one row; narrow layouts stack them. `[B]` and `[T]`
open pickers for local branches and already-known remote refs. The `base...compared`
result preserves the current branch and excludes uncommitted work. A folder-grouped
tree selects one diff at a time; `[Tab]`, `[H/L]`, and `[←/→]` switch tree/diff focus.
Shortcut chrome stays outside and above scrollable content; intraline content stays
within its pane. `[C]`/`[Esc]` returns to Diffs. Cards, files, folders, and selectors
are mouse-accessible.

In Diffs, `[Tab]` visits tree, diff, and compact Git terminal; `[H/L]`/`[←/→]` connects
tree/diff, and `[T]` directly focuses the terminal. Below preview, it retains a fixed
`git` prefix, records commands produced by actions, and keeps stdout/stderr line by
line up to 2,000 entries. Manual input is passed as Git arguments without shell
composition. Autocomplete covers commands, options, local/known-remote branches,
tags, remotes, and changed files. `[Ctrl+N/P]` selects suggestions, `[Ctrl+Y]` applies,
and `[Esc]` dismisses them before returning to the diff. Ref reads are local, with
no fetch. `[↑/↓]` and mouse scroll output; `[O]` opens Log and `[V]` identifies the
active diff layout.

The file tree uses only native two-character Git status with per-column semantic
colors, and distinct folder colors. Unbranched folder chains show one name per line
at the same indentation while remaining one focus/navigation block. Staging updates
the visual snapshot immediately and reconciles only `git status`, without waiting
for history. `[A]` on a folder stages only descendants; `[Space]` toggles the selected
file or all folder descendants as one group. `[D]` confirms the exact target before
restoring tracked changes and removing new files, recursively for selected folders.
Literal path handling preserves names containing Git pathspec syntax.

`[Ctrl+P]` respects keyboard ownership: in the terminal it selects the previous
suggestion, and it never crosses modals or partial staging. Consumed events, repeats,
and extra modifiers cannot open local configuration.

### Partial staging

`[Enter]` on a tree file opens/focuses its diff. `[S]` in a tracked text diff opens
partial staging in unified layout. Two side-by-side panes show the desired unstaged
and staged states, including index hunks that can be removed. `[S]` switches hunk/line
mode without discarding transfers or highlighting. `[H/L]`/`[←/→]` switches panes,
`[J/K]`/`[↑/↓]` navigates, and `[Space]` transfers/returns an item.

Focus stays in these two panes: edge movement stays within the nearest pane, `[Tab]`
cycles only them, and terminal shortcuts cannot escape. The Git terminal is hidden
to give code more space. Scrolling follows the selected renderable rather than its
index, keeping uneven-height hunks and the final target above actions. `[Enter]`
and `[Esc]` apply the state and exit. A blue left rail spans the active hunk.

Before `git apply --cached`, the app rereads staged/unstaged patches for the literal
path and rejects stale selections. New, deleted, binary, and hunkless files do not
offer partial staging.

### Simulated local tutorial

The first tutorial module fully simulates `[1] Git · Diffs`: local tab, repository/
branch, files, mini commit graph, diff, contextual actions, terminal, and shortcuts.
Dedicated steps demonstrate file/folder staging with `[Space]`, navigation/focus,
project/branch selection `[Ctrl+P]`, layouts `[V]`, full graph `[G]`, detailed Log `[O]`,
partial staging `[S]`, and safe discard `[D]`.

Every visual step enters the explained state: `[Ctrl+P]` opens unified configuration
on Diffs, `[G]` replaces the diff with the full graph, `[O]` shows expanded Log blocks,
`[V]` shows split code, and `[S]` shows unstaged/staged panes with the terminal hidden.
The highlighted target moves from trigger to visible result. PR, Issues, Inbox,
project discovery, real Git, and remote access are excluded.

The second module enters Compare in the same tab `[1]`. It shows three selectors,
shared local configuration, separate simulated base/compared pickers with local and
known-remote refs, and the `base...compared` direction. Applied refs show the header,
statistics, grouped tree, selected diff, split layout via `[V]`, navigation through
`[Tab/H/L/←/→]`, and return with `[C]`/`[Esc]`. Targets existing only in these states
are marked `stateful` so they remain in the discovered sequence before visual changes.
No step lists real refs, runs Git, checks out, fetches, or includes worktree changes.

### Local rendering and background work

In framed mode only the focused pane receives an accent border. Tree, Log, and full
graph accept `[J/K]`/`[↑/↓]` when focused; local history does not use `[N/P]`. During
file changes, keep the visible diff mounted until its replacement is ready. Exclude
the project/branch header from loading frames and vertical compression: its row
remains reserved when larger diffs arrive during repeated arrow input. Regressions
check painted text as well as bounds in compact/framed modes; mounted identity alone
cannot detect preview content covering the header.

The first usable snapshot does not wait for the graph. History arrives in the
background; later polls repeat `git log --all --numstat` only when ref signatures
change. Log extends the same colored topology lanes through each commit block:
hash, branch/tag refs, merge parents, author/email, relative date, file count, `+/-`,
subject, and bounded message body. Viewport calculations use actual block heights
so selection stays above the footer; commit text is sanitized before rendering.

Since 2026-09-08, the last row loads the next page inside the scrollbox; `[R]` and
the configured interval refresh all sections to their loaded depth. Query autocomplete
uses `[Ctrl+N/P]` and `[Ctrl+Y]`. See [Inbox](./git-inbox-interface.md) for the sibling
workspace.

While PR is active, the visible section and selected PR details refresh every 30
seconds; activating a stale tab refreshes them promptly. `[R]` reads both immediately.
The configured interval remains a separate full-section sweep, including loaded page
depth. Failed background detail reads retain the usable preview. Cancellation of a
superseded list or detail read does not show an error. Explicit refresh can replace
a pending page without letting that page overwrite the new list; timed and
foreground refreshes wait while pagination is active.

Full-panel loads use shared ASCII plasma behind foreground status text with a short
dissolve. Incremental pagination and background refresh remain inline over usable
content. Local context/remote section LRU caches are capped at 64 entries; session-owned
PR/Issue detail caches at 32.

Future shortcut, density, placement, or confirmation changes must update this
specification and its tests without claiming they are gh-dash behavior.

Since 2026-09-10, PR/Issue checkout shares a canonical-clone guard. Git status/metadata
failure or timeout, invalid index/gitdir, an ongoing operation, or changes during
confirmation block dispatch. Reinspect the clone after the single `gh` call.
Unreadable postconditions and post-dispatch output limits remain uncertain outcomes,
never reasons to replay automatically.

## Data, persistence, and action contracts

Diffs remains offline and independent of remote context. Reading PRs does not require
checkout; only explicit checkout can change the selected clone. [Issues](./git-issues-interface.md)
and [Inbox](./git-inbox-interface.md) keep separate models, services, and state.

- PR profiles use `$XDG_CONFIG_HOME/tuiminal/git-pr.yaml`, falling back to
  `~/.config/tuiminal/git-pr.yaml`, with atomic `0600` writes. Preferences, selectors,
  and local paths persist; remote bodies, drafts, and caches do not. Invalid
  configuration produces an error without replacing the file with defaults.
- Without an explicit profile, a recognized GitHub `origin` selects that repository;
  otherwise use authenticated account scope. An explicitly saved empty repository
  list also means account scope, never GitHub-wide search.
- Actions prepare exact host, account, repository, node ID, number, head SHA, and auth
  generation; reauthenticate, reread eligibility, confirm, execute once, and reconcile.
  Timeout, cancellation, incomplete stdin, output limits, or connection failures
  after dispatch do not prove failure: preserve an uncertain result without retry.
  Failed list/detail reads show localized connection guidance rather than raw socket
  output.
- Automated calls pass explicit arguments/stdin to `gh`, without shell interpolation,
  token reads, or global account switching. The user's guided PTY is a separate transport.
- Merge uses `--match-head-commit`, never `--admin` or `--delete-branch`, and respects
  allowed methods. Queue/auto-merge is not completed merge; confirmation depends on
  remote state. Update branch uses `expected_head_sha`; approval reviews pin `commit_id`.
- Checkout never automatically clones, stashes, resets, cleans, or executes PR code.
  It requires the canonical guard, a matching remote, and a clean staged/unstaged/
  untracked worktree.
- Workflow approval is offered only for an eligible run of the current selection.
  Deployment protection opens the browser without claiming approval. Watches own
  the observed identity/attempt; stopping cancels reads and invalidates old responses,
  notifications, and timers.

## Maintained verification

The gate is `bun run check`. Configuration, runtime, action, and transport regressions
live in `tests/git-pr-config.test.ts`, `tests/git-pr-runtime.test.ts`,
`tests/git-pr-actions.test.ts`, and `tests/github-transport.test.ts`.
`tests/github-process-lifecycle.test.ts` covers complete/partial input, EOF, Unicode,
and cancellation under backpressure on the Bun version in `.bun-version`. Discussion,
resource disposal, and watches have dedicated suites; `tests/tui/` covers the real
interface, including guided terminals, focus, rendering, and simulated tutorials.
Remote reads/writes use fixtures or fake `gh`, never the user's account.

For list/rendering cost, use `bun scripts/benchmark-git-pr.ts`. Measure again on the
checkout under review; older results do not guarantee current latency.
