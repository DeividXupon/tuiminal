# Git Issues interface

Specification for the `[3] Issues` workspace, based on gh-dash and adapted to
Tuiminal's focus, safety, and responsive layout rules.

## Anatomy

```text
┌ [1] [C] GIT · DIFFS  [2] PR  [3] ISSUES  [4] INBOX ──────────────────────┐
│ ISSUES                                      github.com · @viewer         │
│ [A←] My Issues 12 [F→]                                                   │
│ [/] is:open author:@me       ALL PROJECTS · 20/42 · UPDATED              │
├───────────────────────────────┬──────────────────────────────────────────┤
│ ▶ ◆ owner/api #318 Title 6 ♥4 │ owner/api #318 · Title                   │
│     @author · → @ana · bug    │ [OVERVIEW] [ACTIVITY]                    │
│   ◆ owner/web #204 Other 3 ♥8 │ [O] Open [Y] # [Shift+Y] URL [?] Actions │
│     @rui · → @viewer · a11y   │ description, metadata, or comments       │
└───────────────────────────────┴──────────────────────────────────────────┘
 [J/K] Navigate  [H/L] Focus  [A←] [F→] Section  [Z←] [V→] Tab  [P] Preview  [?] Actions
```

Sections are horizontal, without a permanent repository sidebar. The query stays
visible. Two-line rows preserve density while showing authors, assignees, and labels.
New profiles start with `My Issues`, `All`, `Open`, and `Closed`. The three state
filters select all non-archived, open, or closed issues within the current scope.
Preset titles stay in English across UI languages; users may name custom selectors.

Search shares PR handling of quoted phrases: literals do not supply account/repository
filters. Unclosed quotes produce translated guidance before submission, keeping the
text editable and focused in the same modal for both `[Enter]` and `[Ctrl+S]`.

Rows reuse formatting while data, width, columns, and language remain unchanged.
Selection and palette changes do not repeat date conversion and truncation for the
whole list; colors and click handlers remain current.

## Responsive layouts

- Wide (`≥118 × 22`): list on the left, preview on the right.
- Medium (`≥76 × 20`): list above, preview below.
- Narrow: one pane; `[L/→/Enter]` opens preview, `[H/←/Esc]` returns.
- Forced placement applies only if minimum content fits; otherwise use one pane.
- `[P]` hides preview and returns list focus; `[Shift+P]` cycles the per-project
  persisted placement preference.

## Focus, layers, and states

- List: `[J/K]`, arrows, `[G/Home]`, and `[Shift+G/End]`.
- Sections: `[A←]`/`[F→]`; `[/]` edits the active query. Creation, editing, ordering,
  and repository selection belong to Git configuration opened through `[,]`.
- Preview: `[Z←]`/`[V→]` switches tabs. In Overview, `[J/K]` scrolls and `[E]`
  expands/collapses the description. In Activity, `[J/K]` selects comments,
  `[E]` reacts, and `[Enter]` replies to the selection.
- `[Shift+E]` reacts to the issue. The picker maps `[1]`–`[5]` to 👍 ❤️ 🎉 😄 👀,
  shows counts and existing reactions. A comment with any reaction uses the
  contextual new-reaction label (`[E] Nova reação` in Portuguese).
- `[?]` shows all actions, their availability, and reasons for disabled states.
- Inputs own letters, numbers, and global shortcuts. `[Esc]` first unfocuses,
  then closes the modal; one event never crosses two layers.
- Open/closed state uses symbols and text; color is supplementary.
- Remote Markdown is sanitized terminal text: no HTML execution or image downloads.
- Loading, empty, missing authentication, incompatible `gh`, partial errors,
  insufficient permissions, and uncertain results are distinct states.
- Selection uses host + node ID; an issue removed from a section must not be
  silently replaced with another identity.

## Deliberate differences from gh-dash

- `[H/L]` controls focus; sections use `[A←]`/`[F→]`.
- Labels use `[Shift+L]`, avoiding conflict with preview navigation on `[L]`.
- Writes require `[Ctrl+S]` and revalidation; arbitrary commands and batch writes
  are not supported.
- Reactions reread and validate the exact node/URL before and after one mutation.
  Replies are flat comments with a validated link and author mention because the
  Issue Comments API has no threaded replies. Activity interprets the relationship,
  hides its technical marker, and indents each reply directly below its parent.
  Completed writes reload the selected details.
- Checkout never clones. It operates only in an eligible local clone under the same
  canonical, fail-closed PR guard; inspection errors or post-confirmation changes
  prevent dispatch.
- Diffs, PR, and Issues remain separate areas with independent state.
- Selecting the last row loads the next page inline. Automatic refresh covers every
  section and the loaded page depth without clearing the list. Queries have GitHub
  autocomplete.
- Initial/detail loading uses full-panel ASCII plasma and readable text, dissolving
  quickly when data arrives. Pagination and refresh stay inline.
- Missing, outdated, or unauthenticated `gh` shows guidance and a responsive mini
  terminal. `[C]` copies the command, and `[Enter]`/mouse focuses the shell. The user
  pastes and executes it; Tuiminal never injects commands. Version/authentication
  detection reloads Issues when ready. The PTY also receives emulator protocol
  responses, and `[Enter]` reopens an exited shell.
- Detail pagination releases its indicator on selection changes and dispatches once
  per event batch. Explicit refresh supersedes earlier pages and debounce. Responses
  and callbacks from an old selection cannot replace current state or repopulate
  caches after cancellation.

## Persistence, scope, and action safety

- Profiles use `$XDG_CONFIG_HOME/tuiminal/git-issues.yaml`, falling back to
  `~/.config/tuiminal/git-issues.yaml`, with atomic `0600` writes and canonical
  project-root keys. Never silently replace invalid configuration.
- Without an explicit profile, repository/account selection follows the
  [PR rule](./git-pr-interface.md). Every search requires `is:issue` and
  `archived:false`; `is:pr` is rejected. An explicitly saved empty list means
  account scope.
- Writes include comments, assignment/unassignment, label deltas,
  `gh issue develop --checkout`, closing, and reopening. Prepare host, node ID,
  repository, number, state, `updatedAt`, and authentication generation; reauthenticate,
  reread, execute once, and reconcile. An uncertain result after dispatch does not
  authorize replaying the mutation.
- Labels and assignees use complete details, not search summaries. Arguments and
  stdin are explicit. Checkout retains the shared clone/remote/clean-worktree guard
  and never creates a clone automatically.
- Session-owned LRU caches retain at most 64 section entries and 32 detail entries.
  Cancellation/disposal prevents late responses from repopulating them.

## Maintained verification

`bun run check` includes `tests/git-issues.test.ts`, `tests/git-issue-config.test.ts`,
`tests/git-issue-actions.test.ts`, `tests/git-reactions.test.ts`, and real renderer
coverage in `tests/tui/git-issues.test.tsx`. Reads and mutations use fixtures/fake
`gh`, never the user's account. Git's tutorial covers Diffs and Compare, not this
remote workspace.
