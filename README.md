<div align="center">

# Tuiminal

**English** · [Português (Brasil)](./README.pt-BR.md)

<a id="um-workspace-completo-de-desenvolvimento-dentro-do-terminal"></a>

### A complete developer workspace inside your terminal.

Databases, GitHub, processes, APIs, and real terminals in one fast, responsive interface.

[![npm](https://img.shields.io/npm/v/tuiminal?label=npm&color=4B75FF)](https://www.npmjs.com/package/tuiminal)
[![status](https://img.shields.io/badge/status-pre--alpha-F7C873)](https://github.com/DeividXupon/tuiminal/releases)
[![license](https://img.shields.io/github/license/DeividXupon/tuiminal?color=72D5A3)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-5FA04E)](#installation)

[Install](#installation) · [Database](#database) · [Git](#git) · [Runner](#runner) · [HTTP](#http) · [Free Terminal](#free-terminal) · [Contribute](#development)

</div>

> [!WARNING]
> Tuiminal is in **alpha**. You can install and try it, but shortcuts, formats, and APIs may change between versions.

Tuiminal keeps your workflow in one place. Open a project once and switch between its database client, Git interface, processes, HTTP client, and terminals with `[Alt+1–5]`.

- Dense interface built with Bun, OpenTUI, React, and tuiparts.
- Works in any directory; Git, Runner, and terminals use the project passed to the CLI.
- Full keyboard and mouse support.
- Framed layout with one continuous panel surface, or compact layout with its denser
  canvas; seven palettes and six languages.
- Processes and PTYs stay alive when you switch tabs.
- Explicit protections for sensitive data, writes, and remote operations.

<a id="instalação"></a>

## Installation

Install the alpha from npm:

```bash
npm install --global tuiminal@alpha
tuiminal
```

You **do not need to install Bun** to use the published package. npm downloads the binary for macOS, Linux glibc, or Windows on x64 and ARM64. The small package launcher requires Node.js 22 or later.

A fresh installation opens **Install official features**. Choose Database, Git, Runner,
HTTP, or Free Terminal with `[↑/↓]` / `[J/K]` or the mouse, then press `[Enter]` to
install and again to open. Use `[Space]` and `[I]` to install several tools. Reopen
this screen through `[,]` → **Official features → Manage features** or
`tuiminal features`. Only installed tools appear in the tabs; Runner is the default
when available. Downloads are version-matched and verified, and live in Tuiminal's
own data directory, outside your projects.

Installed tools have a **[D] Uninstall** button. Confirm with `[Y]` or cancel with
`[Esc]`. Uninstalling closes that tool's sessions and discards unsaved work while
preserving projects and saved settings. You can install it again from the same screen.

For scripted setup: `tuiminal features install git runner` or `tuiminal features install all`.

Each tool includes a detailed description. Hover over a row or navigate with
`[↑/↓/J/K]` to see an animated icon for the tool. Database fills a storage cylinder;
Runner plays, progresses and completes; HTTP sends a request and receives a response
between a client and server. Git shows a branch, and Free Terminal shows a window
with a blinking cursor. Icons adapt to smaller terminals.
During a download, the tool's row fills from left to right with its actual progress.

![Official feature installation](./docs/media/installation.gif)


To update or uninstall:

```bash
npm install --global tuiminal@alpha
npm uninstall --global tuiminal
```

<a id="primeiros-passos"></a>

## Getting started

Open the current directory, another project, or a single tool:

```bash
tuiminal
tuiminal ../meu-projeto

tuiminal banco ./meu-projeto
tuiminal git ./meu-projeto
tuiminal runner ./meu-projeto
tuiminal http
tuiminal terminal ./meu-projeto
```

The aliases `database`/`db`, `run`, and `term`/`tty` are also accepted. In isolated mode, hidden tools are not initialized. Only these commands and aliases are treated as tools; other names are directory paths.

`tuiminal --version` prints the version without loading settings or UI. `tuiminal --help` uses the configured language.

<a id="navegação-global"></a>

### Global navigation

| Action | Shortcut |
| --- | --- |
| Open Database | `[Alt+1]` |
| Open Git | `[Alt+2]` |
| Open Runner | `[Alt+3]` |
| Open HTTP | `[Alt+4]` |
| Open Free Terminal | `[Alt+5]` |
| Open settings | `[,]` |
| Quit | `[Q]`, `[Esc]`, or `[Ctrl+C]` |

On macOS, `Alt` corresponds to `Option`. If your terminal does not send these combinations, enable **Use Option as Meta key** or the equivalent setting. Unmodified numbers remain available for actions within each tool.

All tools share compact notifications at the top right: at most three cards remain visible without taking keyboard focus. Every card has a thin colored countdown line and enters and leaves with a short animation. Information is blue, success is green, and errors are red and remain visible a little longer. Hovering any card pauses every visible notification and resumes all countdowns when the pointer leaves.

To copy text, drag with the left mouse button to select it, then right-click the
selection. This also works in isolated tools and dialogs. Copying uses the terminal's
OSC52 clipboard support; if it fails locally, the selection remains available to retry.
Masked password fields copy only their mask.

<a id="cinco-ferramentas-um-único-fluxo"></a>

## Five tools, one workflow

| Tab | Purpose |
| --- | --- |
| `[Alt+1]` Database | Explore data and schemas, write SQL, and prepare transactional changes. |
| `[Alt+2]` Git | Review local diffs, PRs, Issues, and GitHub notifications. |
| `[Alt+3]` Runner | Discover commands, run services, and follow multiple logs. |
| `[Alt+4]` HTTP | Build, save, send, and automate API requests. |
| `[Alt+5]` Free Terminal | Run shells and any CLI in compact sections of up to two terminals. |

<a id="banco"></a>
<a id="database"></a>

## Database

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/database.gif" alt="Tuiminal Database tab demo" width="100%">
</p>

A responsive database explorer with a catalog, grid, inspector, and SQL workspace. No connection is created automatically: the first launch opens the connection manager.

<a id="o-que-você-pode-fazer"></a>

### What you can do

- **Connect:** MySQL/MariaDB, PostgreSQL, SQLite, and optional MySQL MCP servers. MCP is always explicit and read-only.
- **Explore:** schemas, tables, and views; inspect records, columns, indexes, DDL, constraints, and relationships. `[/]` filters the catalog; `[Enter]` moves from the filter to the matching table list, and a second `[Enter]` opens the selected table. In `[4]` Schema, `[G]` toggles a one-hop ASCII relationship diagram for the open table; narrow terminals stack each foreign-key connection vertically.
- **Find data:** sort the active column, search all columns, and scroll horizontally while keeping the selected row. The table grid keeps up to 50 fetched rows and loads 40 more at either edge when you press the direction key again. Each table read shows a syntax-colored SELECT preview in a notification, including its table and `LIMIT`/`OFFSET`; projected columns and search literals are abbreviated.
- **Select batches:** `[Space]` marks rows; `[Alt+Space]` sets an anchor and `[↑/↓]` grows or shrinks a spreadsheet-style range.
- **Review writes:** stage `INSERT`, `UPDATE`, and `DELETE` locally. `[Ctrl+S]` opens review and executes the approved batch in a single transaction.
- **Edit large selections:** indexed lookup of staged changes preserves snapshots and exact `BigInt` keys before review.
- **Preserve decimals:** `DECIMAL`, `NUMERIC`, and `MONEY` values retain their entered digits through submission, including scientific notation. Database precision and scale still apply.
- **Write SQL:** keep up to six independent tabs, execute only the statement under the cursor, cancel queries, and adjust the editor/result split. Results keep at most 50 fetched rows; pressing `[↓]` again at the last row or `[↑]` again at the first loads the next overlapping block of 40. Layout changes and maximization preserve the editor and draft.
- **Inspect and export:** view every field in a row and export marked rows as CSV, TSV, or JSON.
- **Protect information:** mask sensitive columns on demand and customize the terms used to identify them.

<a id="fluxo-de-escrita"></a>

### Write workflow

1. Open a table or run an editable simple `SELECT`.
2. Use `[Enter]`/`[E]` to edit, `[Ctrl+A]` to stage a row, or `[dd]` to stage deletion.
3. Review the local-change indicators in the grid.
4. Press `[Ctrl+S]`, review every statement, and confirm again.
5. Tuiminal executes one transaction; a failed statement rolls back the entire batch.

Repeated rapid confirmations do not duplicate an in-flight execution. Approved statements cannot be changed during the transaction.

SQL results are editable only when they directly select columns or `*` from one identifiable table. Expressions, aliases, duplicate columns, aggregates, grouping, `DISTINCT`, and ambiguous queries remain read-only. Editing or deleting requires the complete primary key in the result.

In MySQL, unqualified double-quoted fields remain read-only because they may be string literals; prefer backtick-quoted identifiers. Double-quoted columns remain editable in PostgreSQL and SQLite.

Profiles start **read-only**. Passwords are not written to configuration JSON: when requested, they go to macOS Keychain, Linux libsecret, or Windows Credential Manager. `DATABASE_URL`, `MYSQL_URL`, and `POSTGRES_URL` can be discovered without silently becoming editable profiles. The password field stays masked while editing and resizing, including wide characters such as ideographs and emoji.

Connection tests release temporary clients on failure as well as success. Environment URL passwords are decoded once, and a passwordless URL does not inherit the previous password.

Native reads use PostgreSQL `READ ONLY` transactions, MySQL/MariaDB transaction and session protection, and a read-only SQLite handle in the editor, even for writable profiles. Unknown routines, state-changing PRAGMAs, and effectful commands require enabled writes and confirmation. Use least-privilege server credentials: application mode is not a sandbox for database routines. Optional MCP servers and their credentials must enforce read-only access themselves.

New SQL history entries store metadata only. Full SQL, parameters, and detailed errors stay in a session cache limited to 200 entries and 2 MB. After shutdown or eviction, metadata remains without rerun capability. In Database settings, `[D]` opens legacy-content cleanup and `[Y]` confirms it: metadata and favorites are preserved, but cleanup cannot be undone and does not remove backups. **Explicitly saved favorites still write full SQL to disk**; avoid saving secrets in them.

Export previews process only the first visible rows and retain the original language of values. Copying or saving includes the entire selection in CSV, TSV, or JSON.

<a id="atalhos-essenciais-do-banco"></a>

### Essential Database shortcuts

| Action | Shortcut |
| --- | --- |
| Manage connections | `[C]` |
| Data, columns, indexes, and schema | `[1]`, `[2]`, `[3]`, `[4]` |
| Schema details / relationship diagram | `[G]` in Schema |
| Navigate rows | `[J/K]` or `[↑/↓]` |
| Open table or edit cell | `[Enter]` |
| Search tables / search data | `[/]` / `[S]` |
| Sort column | `[O]` |
| Mark row / select range | `[Space]` / `[Alt+Space]` |
| Export selection | `[X]` |
| Previous / next page | `[P]` / `[N]` |
| Previous / next table | `[A←]` / `[F→]` |
| Open SQL workspace | `[W]` |
| Execute current SQL statement | `[Ctrl+A]` |
| Cancel query | `[Ctrl+X]` |
| New / close SQL tab | `[Ctrl+N]` / `[Ctrl+W]` |
| Switch SQL tabs | `[Alt+←/→]` |
| Adjust split / maximize pane | `[Ctrl+↑/↓]` / `[F10]` |
| Review staged writes | `[Ctrl+S]` |
| Refresh data and catalog | `[R]` |

Connection settings and history metadata live in `~/.config/tuiminal/databases.json`, retaining up to 100 recent reads and 184 days of writes. New entries do not persist SQL, parameters, or diagnostics; sensitive-column terms belong to global settings.

<a id="git"></a>

## Git

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/git.gif" alt="Tuiminal Git tab demo" width="100%">
</p>

A lazygit-style local workspace and three remote dashboards inspired by gh-dash. Diffs works offline; PR, Issues, and Inbox load separately when first opened.

Navigation separates the local project from the GitHub account:

```text
LOCAL · …/tuiminal      │ GITHUB · @account
[1] [C] DIFFS           │ [2] PR  [3] ISSUES  [4] INBOX
```

The local label follows the selected project. GitHub shows the account already loaded
by the active remote tab, or `—` before one is available; the header makes no extra
GitHub requests. Narrow terminals stack the two groups. `[C]` switches the local
view between Diffs and Compare.

### `[1] Diffs`

- Groups changed files into a real tree. Unbranched directory chains show each folder on its own line without artificial indentation; `[J/K]` treats the chain as one navigable block.
- Distinguishes staged, unstaged, and untracked files using Git's two-character status.
- Shows unified, side-by-side, or intraline previews with syntax highlighting and old/new line numbers. Character-level comparison is computed only in intraline mode and reused until the document changes.
- Keeps a small commit graph below the tree. `[G]` expands it; `[O]` opens a `git log`-style history with a colored graph spanning each commit block. Blocks include hash, branches/tags, merge parents, author/email, relative date, file count, `+/-` statistics, subject, and message body.
- `[Space]` stages/unstages the selected file or all descendants of a folder, including names containing `*`, `?`, brackets, or `:`. `[A]` stages a folder's descendants or toggles all files when a file is selected. Colors update immediately; subsequent staging actions remain available, and confirmation reloads only status. The mounted preview reconciles silently without a loader or scroll reset; the graph refreshes in the background only when refs change.
- `[Enter]` on a tree file opens and focuses its diff. With a tracked text file focused, `[S]` opens partial staging in unified mode. Unstaged and staged panes sit side by side and include hunks already in the index so they can be removed. `[S]` switches hunk/line mode without losing pending transfers or highlighting; `[H/L/←/→]` switches panes, `[J/K]` navigates, and `[Space]` transfers an item. Scrolling keeps the entire target above the action row even for uneven hunk heights. The Git terminal is hidden while partial staging is open, and `[Tab]` stays within its two panes. `[Enter]` and `[Esc]` apply the displayed state and exit. The active hunk has a full-height blue left rail; file changes during selection cause safe rejection.
- In a focused diff, `[Shift+H/L]` or `[Shift+←/→]` scroll to the last character, with clickable controls at the lower right. Numbers, signs, and change backgrounds remain fixed. Split-mode code scrolls together without hiding either column. Vertical navigation preserves horizontal position; leaving the diff resets it to the left.
- The project/branch header retains its space while navigating the tree, including when a larger diff finishes loading.
- `[D]` discards the selected file or folder after explicit confirmation, restoring tracked changes and removing new files.
- A Git terminal below the diff shows seven rows and retains up to 2,000 history lines of actual command output. `[T]` focuses it for manual commands; `[↑/↓]` and mouse scroll output; `[F10]` maximizes/restores it within the preview pane. The `git` prefix is fixed, without shell command composition. Autocomplete suggests commands, options, known local/remote branches, tags, remotes, and changed files: `[Ctrl+N/P]` navigates, `[Ctrl+Y]` applies, and `[Esc]` dismisses.
- `[C]` switches to **Compare**, comparing two known refs through `base...compared` without checkout or uncommitted changes.
- `[Ctrl+P]` chooses another local repository/branch without changing PR, Issues, or Inbox scope. In the terminal it belongs to autocomplete; it cannot open settings over a modal or partial staging.
- The Git tutorial demonstrates both local modes in tab `[1]` using simulated data. Diffs covers the header, changed-file tree, mini commit graph, preview, actions, terminal, navigation, and `[Ctrl+P]`, `[Space]`, `[G]`, `[O]`, `[V]`, `[S]`, `[D]`. It then enters `[C] Compare`, opens simulated project/base/compared selectors, explains `base...compared`, and shows the commit-only summary, grouped tree, selected diff, three layouts, and return via `[C]` or `[Esc]`. Stateful steps show the resulting view; the tutorial never discovers projects, runs Git, fetches refs, or accesses GitHub.

The three remote dashboards remove blank spacer rows in framed mode. Wide PR and
Issues screens place sections and actions on one row; narrower screens stack them.
Compact mode keeps its existing geometry.

### `[2] PR`

- `[Ctrl+N]` opens a creation form with searchable repository, remote base, and compare branch pickers, plus title, Markdown description, and a draft option. The base starts with the selected repository's default branch and remains selectable. The title starts with the latest commit subject from the compare branch and remains editable. Tuiminal checks both selected branches before one GitHub API submission; it does not push a local branch.
- Starts with **My PRs**, **Review requested**, **All**, **Open**, and **Closed**. The last three select non-archived PRs by state within the current scope.
- Lists state, repository, review, CI, author, assignees, comments, labels, and diff size.
- State marks are green for open, purple for merged, gray for draft, and red for closed.
- Preview tabs show overview, checks, activity, commits, and files.
- Stopping CI watch or closing its screen cancels the active request; old responses neither notify nor interrupt a new watch.
- In Activity, `[J/K]` selects comments, `[E]` opens five quick reactions (👍 ❤️ 🎉 😄 👀), and `[Enter]` replies with a reference to the original comment. Replies group under their parent; a comment with reactions offers a new reaction. `[Shift+E]` reacts to the PR itself.
- Remote diffs open inside Tuiminal and preserve the queue on return.
- Queries and sections use GitHub qualifiers with autocomplete for `repo:`, `author:`, `review-requested:`, and other filters.
- Comments, reviews, merges, and other writes use preparation, reauthentication, remote-state rereading, and confirmation before execution.

### `[3] Issues`

- `[Ctrl+N]` opens a creation form with a searchable repository picker, title, and Markdown description. Both creation forms keep the draft in memory until submission and require `[Ctrl+S]` to create.
- Starts with **My Issues**, **All**, **Open**, and **Closed**, selecting non-archived issues by state within the current scope.
- Combines a dense two-line list with overview and activity previews.
- Its state mark is green for open and red for closed.
- In Activity, `[J/K]` selects comments, `[E]` reacts with 👍 ❤️ 🎉 😄 or 👀, and `[Enter]` replies. Replies group under the parent; existing reactions do not hide the new-reaction control. `[Shift+E]` reacts to the issue itself.
- Supports comments, assignment/unassignment, label edits, branch creation with checkout, closing, and reopening.
- Searches remain scoped to non-archived issues and never accidentally become GitHub-wide searches.

### `[4] Inbox`

- Combines Inbox, review requests, assignments, mentions, and locally saved items.
- Filled and hollow marks still distinguish unread and read. PR and Issue marks also take the subject's state color, with a text label; other subjects or unavailable states stay neutral.
- Marking read is explicit; completing and unsubscribing require confirmation.
- Automatic refresh preserves visible data when the network fails.

PR and Issues use the `origin` repository when recognized. Outside a repository, the default is the authenticated account, explicitly including organizations and external repositories rather than searching all of GitHub. Remote views require [GitHub CLI](https://cli.github.com/) 2.40.0 or later.

While a PR or Issues tab is active, its visible list and selected details refresh about every 30 seconds, so issues and comments added in GitHub appear without reopening the tab. `[R]` checks both immediately. The configured longer interval still refreshes every section to its loaded page depth.

When `gh` is missing or outdated, PR, Issues, and Inbox explain it, display the detected official command, provide `[C]` to copy, and offer a mini terminal focused with `[Enter]` or mouse. Tuiminal starts only the shell: you paste and execute the command, and version detection updates automatically. `[Enter]` reopens an exited shell. Missing authentication uses the same guidance for `gh auth login --hostname <host> --web`; `gh`/GitHub own login and tokens, and the view reloads when the account is detected.

Automated `gh` calls have time limits and wait for process exit on cancellation. A PR/Issue write without confirmation—because of timeout, cancellation, output limits, or incomplete input—is never replayed automatically. Check remote state before retrying.

Switching PR/Issue details releases pagination immediately; stale responses cannot replace a newer refresh. Repeated load-more actions in one event batch issue one request. PR discussion changes invalidate the detail cache even if the head SHA stays the same. PR, Issues, and Inbox reuse row text during navigation while keeping language, colors, and data current.

Git settings appear as five rows opened by `[,]`: Diffs under **GIT**, with Pull Requests, Issues, Repositories, and Browser under **GITHUB**. Moving with `[J/K]` or `[↑/↓]` renders the focused row immediately; `[Enter]` or `[L]` moves keyboard focus into its detail pane, and `[Esc]` returns to the rows. A blue left rail marks the focused pane, and the focused row shows a blue `[Enter]`. Local projects and remote repositories appear independently as each discovery finishes. Leaving or reloading the Git context cancels its old remote request. Project/branch pickers and PR/Issue section editors replace the same detail pane and return with `[Esc]`; no second settings modal is opened. Query autocomplete processes only enough candidates to fill visible suggestions.

In Git, open `[,]` → Context → Browser to choose where `[O]` opens PRs, Issues, Inbox notifications, and workflow runs. The default uses your system browser. Browsh and Carbonyl run in an integrated Git terminal; close that view with `[Ctrl+Q]`. `terminal-browser` opens a separate terminal pane. Install the chosen browser command on your `PATH` before opening a link. This Git-wide choice is saved in `~/.config/tuiminal/git-browser.json`.

Repeated `[Enter]` presses do not repeat an in-flight project/branch selection. Leaving a picker with `[Esc]` or its button prevents a late response from closing a replacement picker. Leaving does not cancel or undo an already-started Git command.

Quoted query text stays literal: mentioning `repo:` or `author:@me` inside a phrase does not remove account scope. Values such as `label:"help wanted"` retain spaces. Unclosed quotes must be completed before submission; applying or saving an incomplete query shows a warning in the same context pane while preserving text and focus.

<a id="atalhos-essenciais-do-git"></a>

### Essential Git shortcuts

| Action | Shortcut |
| --- | --- |
| Open Diffs, PR, Issues, or Inbox | `[1]`, `[2]`, `[3]`, `[4]` |
| Toggle Diffs / Compare | `[C]` |
| Navigate list | `[J/K]` or `[↑/↓]` |
| Switch tree, preview, and Git terminal focus | `[Tab]`; `[H/L]` or `[←/→]` between tree and preview |
| Scroll a focused diff horizontally | `[Shift+H/L]` or `[Shift+←/→]` |
| Change section | `[A←]` / `[F→]` |
| Change internal preview tab | `[Z←]` / `[V→]` |
| Open remote diff | `[D]` |
| Open remote actions | `[?]` |
| Open selected PR, Issue, or Inbox notification | `[O]` |
| Create a PR or issue in its tab | `[Ctrl+N]`, then `[Ctrl+S]` |
| Stage file/folder or all files | `[Space]` / `[A]` |
| Stage hunks or lines in the focused diff | `[S]`, then `[S]`, `[H/L/←/→]`, `[J/K]`, `[Space]`, and `[Enter]` |
| Discard file/folder with confirmation | `[D]` |
| Focus Git terminal | `[T]` |
| Open local history / graph | `[O]` / `[G]` |
| Change diff layout | `[V]` |
| Change Diffs project/branch | `[Ctrl+P]` |
| Edit remote query | `[/]` |

Remote scope is saved in Git profiles. The local Diffs selection is separate in `~/.config/tuiminal/git-diffs.json`; the browser choice lives in `~/.config/tuiminal/git-browser.json`; saved Inbox items live in `~/.config/tuiminal/git-inbox.json` with `0600` permissions.

<a id="runner"></a>

## Runner

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/runner.gif" alt="Tuiminal Runner tab demo" width="100%">
</p>

Runner is Tuiminal's initial screen. It discovers project commands, starts short- and long-running processes, and keeps logs, input, and history in the same workspace.

<a id="o-que-você-pode-fazer-1"></a>

### What you can do

- **Discover automatically:** JavaScript scripts, Composer/PHP, Laravel, Symfony, Python/Django, Go, Rust, Ruby/Rails, Maven, Gradle, .NET, Deno, Taskfile, Makefile, justfile, and Docker Compose.
- **Run any command:** the manual field accepts literal command text; `[Ctrl+S]` saves a name and explicit PTY option.
- **Keep processes alive:** selecting an active command opens its existing session. `[R]` starts another instance separately.
- **Follow logs:** switch stdout/stderr, filter, copy, export, show timestamps, and send input to stdin or a PTY.
- **Watch multiple services:** Multi mode shows up to three logs side by side and navigates additional groups.
- **Act on groups:** select commands and start, stop, or restart them together; simple groups run in parallel.
- **Order commands and services:** dependencies wait for successful completion or startup with health checks. Cycles and missing references are rejected before execution; failure or cancellation blocks pending dependents.
- **Save project flows:** `[Ctrl+Y]` opens the YAML configuration file inside the terminal. Create named flows with sequential and parallel stages, then run, stop or restart them from the TUI.
- **Edit commands locally:** configure literal command, directory, environment/profile, PTY, restart policy and health checks, including overrides for detected commands. The editor shows documentation, validation and keyboard/mouse suggestions without changing project files.
- **Switch projects:** `[N]` opens another repository/directory without interrupting active processes. Up to four projects occupy local tabs `[1]–[4]`.
- **Use detected ports:** open or copy a URL, or send it directly to the HTTP tab.

Logs update in batches and retain up to 1,200 entries, with per-entry and per-process size limits. Clearing a log also discards output pending display; final lines remain visible after exit.

Single and Multi retain the original language of program output; only Tuiminal messages are translated. Port discovery waits for each probe before starting the next and cancels only its own helper when leaving the context.

Project discovery deduplicates overlapping directories and performs up to 16 concurrent reads, with limits of 300 projects and seven levels. Detected commands use the selected project's paths. Deno JSONC task text is preserved even when it contains comment markers.

Discovery reads `.tuiminal/runner.yaml`, `mprocs.yaml`, `Procfile`, `Procfile.dev`, `Taskfile`, `Makefile`, and other supported formats. Only explicit `autostart: true` in Tuiminal configuration, including locally saved commands and flows, can request automatic startup. The first request shows the project, commands, directories, profile, and variable names for approval. Trust is local, and a material configuration change requires renewed confirmation. `mprocs` and `Procfile` never start implicitly.

```yaml
version: 1

profiles:
  development:
    envFile: .env.development
    env:
      LOG_LEVEL: debug

commands:
  api:
    command: npm run dev
    profile: development
    cwd: services/api
    restart: on-failure
    maxRestarts: 5
    health:
      type: http
      url: http://127.0.0.1:3000/health
      timeoutMs: 30000
```

<a id="atalhos-essenciais-do-runner"></a>

Edit `commands`, `flows` and `profiles` as YAML with syntax colors and contextual help. A read-only recommendation list follows the cursor as you type or move with arrows, shows options for the current YAML block, and describes the selected option beside the list. After `flows:` and `[Enter]`, it shows an example flow ID (`dev:`); while you type another ID, it shows the required colon, then offers fields such as `label` and `stages` inside that flow. The same guidance appears for command and profile IDs and environment variable names. Close typos show likely alternatives from that block; unrelated text closes the recommendation list. Use `[Ctrl+J/K]` or a mouse click to inspect options; type the desired key or value yourself. `[Enter]` indents the next line for mappings, list entries and literal command blocks; `[Tab]` inserts two spaces. `[Esc]` dismisses recommendations, then returns to command/flow management. Dependencies use `dependsOn` entries with `commandId` and `condition`; flow stages use `commandIds` and `waitFor`. `started` waits for the configured health check. `[Ctrl+S]` validates and saves. See the [Runner specification](docs/design/runner.md) for complete YAML examples.

### Essential Runner shortcuts

| Action | Shortcut |
| --- | --- |
| Run or open an existing process | `[Enter]` |
| Start another instance | `[R]` |
| Focus manual command / save | `[/]` / `[Ctrl+S]` |
| YAML editor | `[Ctrl+Y]` |
| New command / flow (management list) | `[Ctrl+N]` / `[Ctrl+F]` |
| Run / stop / restart selected flow | `[Ctrl+R]` / `[Ctrl+K]` / `[Ctrl+T]` |
| YAML newline and indentation / suggestions / save | `[Enter]` and `[Tab]` / `[Ctrl+Space]` / `[Ctrl+S]` |
| Browse YAML recommendations | `[Ctrl+J/K]` |
| Commands / active processes | `[P]` |
| Single / Multi view | `[M]` |
| Previous / next Multi group | `[A←]` / `[F→]` |
| Select group | `[Space]` |
| Start / stop / restart group | `[G]` / `[Shift+G]` / `[Shift+R]` |
| List → log / log → list | `[L/→]` / `[H/←]` |
| Expand / collapse history | `[S]` |
| Stop current process | `[Shift+K]` |
| Open action menu | `[A]` (Single) / `[Shift+A]` (Multi) |
| Open another project | `[N]` |
| Switch Runner projects | `[1]`–`[4]` |
| Close project tab without stopping processes | `[Ctrl+X]` |

The YAML editor saves `~/.config/tuiminal/runner/<project-hash>/runner.yaml`, without changing project files. Existing saved commands and flows are included on the first save. `runner.json` retains sessions, history and legacy definitions for projects without YAML. Logs persist only through opt-in or export to `tuiminal-logs/`. Tuiminal stops only processes it started when exiting.

<a id="http"></a>

## HTTP

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/http.gif" alt="Tuiminal HTTP tab demo" width="100%">
</p>

A compact API client with documents, collection, request builder, response inspection, and automation. Its interactive data lives in one global HTTP home (`$XDG_DATA_HOME/tuiminal/http`, or `~/.local/share/tuiminal/http`) regardless of the opened project. Layout adapts from three columns to split or single-pane views without losing drafts, cursor, response, or focus.

<a id="o-que-você-pode-fazer-2"></a>

### What you can do

- **Build requests:** method, URL, query parameters, headers, JSON/text/XML, URL-encoded forms, multipart, file bodies, and Bearer, Basic, or API Key authentication.
- **Inspect responses:** status, duration, size, headers, timing, Pretty/Raw, search, JSONPath, copy, save, and comparison. Valid JSON receives formatting and colors, with tree controls in a separate gutter and a full-row highlight on the selected block. With the response focused, `[↑/↓]` or `[J/K]` navigates blocks, `[←/→]` collapses/expands, and `[Enter]` toggles the current block. Navigable Pretty JSON keeps one row per line for accurate selection; Wrap remains available in Raw and other response views.
- **Control space:** request/response starts at `50/50`; `[Ctrl+↑/↓]` and the drag handle share a per-document ratio limited to 25–70%.
- **Save collections:** import and save interoperable `.http`/`.rest` files in the global HTTP home without silently rewriting unsupported blocks.
- **Organize collections with keyboard or mouse:** move through the collection tree with `[↑/↓]` or `[J/K]`, collapse and expand with `[←/→]`, and open requests with `[Enter]`. Create folders, `.http` collections, and requests; rename or delete selected items. Empty folders and collections remain visible. Deletion requires confirmation; changed or running open requests must be handled first.
- **Import:** enter a full path or `~/` path to a Postman v2.0/v2.1 or OpenAPI 3.0/3.1 file, use `[↑/↓]` and `[Tab]` to complete it, or drop a file into the import box when the terminal pastes its path. Tuiminal detects the format from the file contents and shows it in the conversion preview with loss warnings; the resulting `.http` is saved in the global HTTP library only after confirmation, independent of the opened project.
- **Connect a Postman account:** run `tuiminal postman login` for a prompt that does not echo the API key, or pipe a key to `tuiminal postman login --api-key-stdin`; add `--region eu` for an EU account. When connected, HTTP opens with Local and Postman source cards; `[Ctrl+G]` switches sources. In Postman mode, choose a workspace to load all its collections, initially with every collection and folder collapsed; `[E]` optionally selects an environment. The left tree shows the workspace name above its collections, omits the internal `postman/` folder, and uses Postman method colors. `[?]` reveals collection actions and shortcuts. The key and imported variable values use the system credential store. Tuiminal creates linked `.http` files for new collections under the global HTTP home and private, selectable environments when variables are available; it does not change the opened project. `[Shift+N]` creates a collection in the selected source; Postman uses the active workspace or asks for one before selection. Create, rename, duplicate, and delete linked requests; create, rename, and delete linked collections and nested folders. These actions update Postman and the local copy. `[Ctrl+S]` sends changes to a linked request; for a new request it offers a destination collection or folder and creates it in Postman. `[Ctrl+P] Postman` retries a pending send. Conflicts and failed remote writes are reported. Moving requests between files is not yet available for Postman. Imported environment edits remain local. Vault values unavailable through the API, scripts, saved responses, and unsupported authentication are reported or omitted. See [Postman account access](./docs/design/postman-account.md) for the exact boundaries.
- **Automate:** status/header/body/JSONPath assertions, request dependencies, and public or volatile variable extraction.
- **Run collections:** resolve dependencies topologically, use JSON/CSV datasets, limit concurrency, and emit text, JSON, or JUnit reports. Selection works with duplicate request names. Reopening the runner or changing its target cancels the previous run; stale results cannot replace the new one.
- **Use environments:** `[E]` lists selectable environments; `[N]` creates one, `[E]` edits or renames the selected one, and `[D]` deletes it after confirmation. `[G]` opens always-active `Globals`, whose name is fixed. Each form has a name and variable/value table; `[/]` chooses a block, `[↑/↓]` moves its focus rail, and `[Enter]` opens it. Alternating row backgrounds and a highlighted cell make table navigation clear. `[Tab]` advances through cells; populated tables support arrows or `[H/J/K/L]`, `[Enter]` to edit, and layered `[Esc]` to leave. Values are visible while editing and always saved in the operating system's credential store; the private environment file contains only opaque references for new or edited values. The bordered modal owns focus while open. Workspace defaults are no longer applied.
- **Edit request tables:** in Query/Path Params, `[J/K]` or `[↑/↓]` chooses a block. `[Enter]` starts the first cell of an empty table or opens navigation over existing rows. Arrows or `[H/J/K/L]` reach the enabled dot, name/value cells, and `[×]`; `[Enter]` activates the selected control, including deletion on `[×]`. `[Space]` enables or disables the selected row, and `[Tab]` advances through inputs into a draft row that becomes real when typed. `[Esc]` steps back from input to table to block. Headers, form URL encoded, and Multipart use the same flow; Multipart also exposes its text/file switch in table navigation. `[N]` is no longer used to add table rows.
- **Write URLs quickly:** type `{` in the URL to see available variable names, then `[Tab]` to complete `{{name}}`. Query pairs such as `?manga=2` appear in Params and can be edited there without sending duplicates.
- **Control transport:** timeout, redirects, cookie jar, HTTP/HTTPS proxy, and TLS. Cookies use Public Suffix List validation and bounded storage isolated by environment and collection directory. `[C]` disables both cookie reads and writes per request. Disabling TLS verification is explicit, visibly red, and requires approval per destination.
- **Review sensitive redirects:** sending a private body/URL to another origin or downgrading HTTPS to HTTP pauses for authorization. `[Y]` continues that hop; `[Esc]` refuses. The confirmation shows destination and risks with known private values masked. Cancellation cannot undo a request already received by the previous server.
- **Handle external responses carefully:** `[O]` opens only allowlisted raster images with matching MIME and signatures. SVG, PDF, generic binaries, and disguised content cannot open through the system handler, but can be explicitly saved. Full download resends only GET, caps at 256 MB, and removes partial files on failure. Repeated activation does not duplicate downloads; closing the owning document cancels them. Completed files are published only after all bytes are written, without replacing an existing destination.

<a id="atalhos-essenciais-do-http"></a>

### Essential HTTP shortcuts

| Action | Shortcut |
| --- | --- |
| Switch route, collection, request, and response | `[Tab]` / `[Shift+Tab]` or `[H/L]` |
| Focus URL / send / cancel | `[/]` / `[S]` or `[Enter]` / `[X]` |
| Previous / next method | `[Shift+M]` / `[M]` |
| Cycle Params, Headers, Body, Auth, and More with request focused | `[A←]` / `[F→]` |
| Cycle nested Body, Auth, or More options | `[Z←]` / `[V→]` |
| Switch Query Params / Path Params | `[J/K]` or `[↑/↓]` |
| Enter a request table / edit a selected cell | `[Enter]` |
| Move through request table controls / inputs | `[H/J/K/L]` or arrows / `[Tab]` |
| Enable/disable a request table row / delete via selected `[×]` | `[Space]` / `[Enter]` |
| Navigate / collapse / expand JSON | `[↑/↓]` or `[J/K]` / `[←/→]` / `[Enter]` |
| Open environments | `[E]` |
| Switch main response view / internal tab | `[A←]` / `[F→]` · `[Z←]` / `[V→]` |
| Open collection / history | `[C]` / `[Y]` |
| Navigate collection rows / first or last row | `[↑/↓]` or `[J/K]` / `[Home/End]` |
| Collapse or expand / open selected request | `[←/→]` / `[Enter]` |
| New request / collection / folder in collection pane | `[N]` / `[Shift+N]` / `[P]` |
| Rename / delete selected collection item | `[E]` / `[D]`, then `[Enter]` to confirm deletion |
| New / close tab | `[Ctrl+N]` / `[Ctrl+W]` |
| Switch documents | `[Alt+←/→]` |
| Save `.http` | `[Ctrl+S]` |
| Adjust split / maximize | `[Ctrl+↑/↓]` / `[F10]` |
| Open jump mode | `[Ctrl+O]` |

A versionable request example:

```http
### Buscar usuário
# @name buscar-usuario
# @depends login
# @extract-secret token = $.token
# @assert status == 200
# @assert jsonpath $.id exists
GET {{baseUrl}}/users/42
Authorization: Bearer {{token}}
```

The same engine also runs without opening the UI:

```bash
tuiminal http run api.http#buscar-usuario --env local --report text
tuiminal http run api.http --data cases.json --concurrency 4 --report junit
tuiminal http import postman collection.json --output .tuiminal/http/imported
tuiminal http import openapi openapi.yaml --output .tuiminal/http/imported
tuiminal postman workspaces
tuiminal postman collections <workspace-id>
tuiminal postman environments <workspace-id>
tuiminal postman pull <workspace-id> <collection-id> --environment <environment-id>
tuiminal postman push postman/<file>.http "<request-name>"
```

Headless redirects carrying a private body/URL require `--allow-private-redirect-to https://destino.example`; downgrades require `--allow-http-redirect-to http://destino.example`. Each flag accepts an exact origin (scheme, host, and port), can be repeated for additional destinations, and lasts only for that invocation. When both risks apply, both authorizations are required. `--allow-insecure-tls` is separate. Even with approval, private/authentication headers from the original origin are not forwarded. Continuing does not replay the previous request or collection dependencies. Timeout and cancellation dismiss pending confirmations; late approvals send nothing. Insecure TLS in the UI retains `[I]` approval by destination, environment, and session.

Responses are captured up to roughly 1.5 MB and rendered within a bounded preview. Capture releases its reader on completion/failure and reports truncation only after observing bytes beyond the limit. Search tracks lines and columns without repeatedly processing the preceding text. Known secrets are masked in preview, cURL, conflicts, reports, and errors; secret extractions stay in memory.

HTTP history stays in the current session and does not persist request or response bodies. Original responses remain in memory for inspection and explicit export. Preview, cURL, reports, and errors mask known secrets; explicitly exported files and older files from previous versions remain separate from session history.

Redirects changing host, port, or scheme remove authentication and other sensitive headers, including custom API key names and resolved private values. These headers remain on same-origin redirects.

In Params → Path, use `:id` segments or explicit `{id}` tokens, such as `/users/:id` or `/reports/{id}.json`. Substitution affects only the path, distinguishes names such as `id` and `id2`, and uses the first enabled row for duplicate names. Query, host, and port remain independent.

Sensitive Path values receive the same protection, including encoded URLs and disabled rows. To save them in `.http`, use private-variable references; literal secrets are rejected without changing the file.

<a id="free-terminal"></a>

## Free Terminal

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/terminal.gif" alt="Tuiminal Free Terminal tab demo" width="100%">
</p>

A general-purpose multiplexer. New terminals use real PTYs and can run shells, REPLs, interactive database clients, Codex, Claude, or any CLI available in `PATH`.

Custom commands accept full shell expressions, including `&&`, `||`, `;`, pipes, variables, and loops. For example, `npm install && npm run dev` runs the second step after the first succeeds.

tmux is optional. New terminals automatically use tmux 3.2+ when available on
Linux, macOS or WSL; otherwise they use the native terminal, including on Windows.
Both modes keep terminals inside this tab: switching to Git hides the panes while
their commands continue running. Nothing is installed automatically. Set
`TUIMINAL_TERMINAL_BACKEND=native` before starting Tuiminal to always use native
terminals (`auto` is the default; `tmux` explicitly requires tmux).

When Terminal opens, it restores windows from the persistent `tuiminal` tmux session
in **Tuiminals** and mirrors ordinary panes from other discovered servers in the
**tmux** folder. Recognized agents from either source appear exclusively in
**Agents**, including sibling panes in the same session. New panes are picked up
without moving your current focus. Closing an external mirror leaves its process running and keeps
that pane dismissed for this execution. Automatic discovery respects the
12-terminal limit. Set `TUIMINAL_TERMINAL_AUTO_MIRROR=0` before launching to disable
external discovery; persistent Tuiminal panes are still restored.

Panes beside Tuiminal in the same tmux session are discovered automatically.
The mirror loads the pane's existing screen and keeps
following that exact pane even when another window is selected in the original
terminal. Keyboard input is shared; closing the mirror only disconnects Tuiminal.
Updates accelerate while output changes and refresh immediately after input.
Unchanged text stays in place, and idle panes reduce their refresh frequency.

External panes cannot be restarted through Tuiminal. Their dimensions temporarily
follow the space available beside the sidebar, including local splits. The agent
redraws to that size in both terminals. The original size and layout are restored
when the last mirror of that window disconnects. When you return to the source
window, Tuiminal releases its temporary manual size and tmux immediately fits the
window to the visible client while retaining current splits, including the pinned
sidebar. After you leave the source window, Tuiminal adopts its latest layout
before fitting the mirror again. Manual changes are not overwritten.
Windows containing Tuiminal itself keep their size and use clipping to avoid a
resize loop. Mirroring refreshes the current application screen;
it does not import scrollback, tmux copy-mode UI or mouse input. Terminals already
open outside tmux are listed as read-only metadata in **Others**, but cannot yet be
mirrored; selecting one identifies its original TTY without replacing the active pane.
Without tmux, create terminals inside Tuiminal to use splits, agent status and
background execution with the native backend.

<a id="o-que-você-pode-fazer-3"></a>

### What you can do

- Keep up to 12 terminals, with at most two panes per section, split right or below.
- **New terminal** always opens a separate section. To split the current section, use the Master Key followed by `[V]` (right) or `[S]` (below).
- Use a compact workspace inspired by Herdr: the agent list comes first in the sidebar, followed by numbered two-line sessions. An idle shell shows `○ Idle`; `● Running` appears only while a foreground tool or command is active. The second row shows its directory, command or exit code with the `native`/`tmux` backend; read-only external rows show their TTY. The active section has an accent rail. Terminals fill the remaining area to every edge; splits use a single separator.
- New terminals and custom commands open in **Tuiminals**. Rename terminals when needed. Click a folder heading, or highlight it with `[↑/↓]` / `[J/K]` and press `[Enter]`, to collapse or expand it. That fold state and reserved tmux session placement are saved per project outside the project directory and restored on the next launch. Only non-empty reserved folders appear. The **tmux** folder contains mirrorable external panes; **Others** lists non-tmux POSIX terminals with their foreground command, state, directory and TTY as read-only references. Recognized external agents appear in **Agents** with unknown activity because Tuiminal cannot inspect their screen. Split sessions keep both two-line terminal items independently clickable beside one vertical separator.
- Terminal names follow the running tool automatically: `zsh` → `lazygit` → `zsh`. Recognized agents show their CLI name, such as `codex`, even when the runtime reports `MainThread` or `node`. This also works with tmux mirrors. Names chosen manually through the Master Key's `[E]` action remain fixed, including after a restart.
- Follow recognized agents exclusively in **Agents**, with an animated loader while they work. **Sessions** shows the remaining terminals. The original folders and splits are preserved, and a terminal returns to Sessions when its agent ends.
- Open **Live Diff** for a recognized agent with Master Key then `[D]`. It shares that agent's existing pane (beside it, or below it in narrow sections) without starting another terminal. Long code lines wrap in the selected file's complete Git patch, including the usual three context lines. **Files** is ordered by most recent change and follows keyboard selection. The preview automatically follows the newest file and scrolls to its latest changed hunk; selecting an older file pauses this, and returning to the newest resumes automatic follow. Newly observed changed lines keep a blue background; each later edit adds more blue lines and briefly shimmers only the new ones. Press `[Enter]` on a file to focus its code: `[J/K]` or `[↑/↓]` scroll one line and `[H/L]` or `[←/→]` scroll half a page. In code, `[Esc]` re-enables automatic follow, selects the newest file and returns to the file list. Rows align New/Edit, a compact project/parent/file path, elapsed time and colored `+`/`−` counts in columns. Folder labels use at most 12 display cells; the selected-file header retains the full path. **Info** shows `Show diff auto: true/false`, theme-colored change counts and the last changed project's path, plus the contextual `[Esc]` hint while code is focused. The panel checks at most every 250 ms while the agent runs. Click **Add project**, or focus the panel and press `[N]`, to include another local repository; related Git worktrees are discovered automatically. `[Esc]` from the file list returns focus to the terminal. The final snapshot remains after the agent exits until the panel is closed.
- Pin the live sidebar with Master Key then `[B]` so Sessions and Agents stay visible while you move between Tuiminal tools. Use `[L]` from the action menu to focus it, move continuously through folder headings, Sessions and Agents with `[↑/↓]` or `[J/K]`, and press `[Enter]` to toggle a folder or open the highlighted item. Focus is marked by a fast light sweep across the sidebar background. Inside tmux, Tuiminal also keeps a marked left sidebar split in each window of the current server: after selecting that split with normal tmux navigation, its direct navigation works immediately, and it remains clickable while the neighboring terminal has focus. Folding a folder keeps that sidebar split selected. The split beside Tuiminal opens a selected terminal in its Terminal workspace, while another window selects its existing tmux pane directly when possible. Its Master Key opens the same actions and can run non-dialog actions without leaving that window. Unpinning removes only those helper splits and restores the previous tmux mouse setting.
- Typing `exit` in an interactive shell closes that terminal and removes it from Sessions; completed custom commands keep their final output available for inspection and restart.
- Match the hosting terminal's reported ANSI palette and default text/background colors in embedded panes, while preserving explicit RGB colors. Preserve colors, cursor, output and processes across resizing, sections and tool switches. Restarts wait for the previous owned process to retire; application shutdown detaches persistent tmux terminals and stops only owned native processes.

In `[,]` → **Terminal**, choose the **Master Key** (default `[Ctrl+B]`). Press it to
show the action list at the bottom, then press an action key or click its control.
`[Esc]` cancels and restores terminal focus. Repeating the Master Key sends its
literal control byte to the process.

| After the Master Key | Action |
| --- | --- |
| `[N]` / `[C]` | New terminal / new section |
| `[/]` | Custom command in a new section |
| `[V]` / `[S]` | Split right / below |
| `[1]` / `[2]` | Focus a pane in the current section |
| `[M]` | Maximize / restore |
| `[B]` | Pin / unpin the sidebar |
| `[L]` | Focus the sidebar |
| `[E]` | Rename terminal |
| `[D]` | Toggle Live Diff for a recognized agent |
| `[R]` / `[X]` | Restart / close terminal |
| `[G]` | Release global shortcuts, including `[,]` |
| `[Esc]` | Cancel the Master Key |

Agent status appears in sidebar markers: an animated loader while working,
`!` needs your input, `✓` done but unseen, `○` idle, and `?` unknown. The separate **Agents** list shows every
running agent, with its status aligned to the right and task title below, falling
back to the terminal name when unavailable. Task titles use each palette's focus accent. Short
layouts use compact rows to keep agents accessible. Click
a row to focus that terminal. Activity labels include reading, searching, thinking,
writing or running when the live agent UI provides that signal. Completion
continues to be tracked in hidden sections; opening the completed pane acknowledges it.
Offscreen requests for input and unseen completions also raise a notification;
click it to open that exact pane, or dismiss it without changing focus.

Task titles use the text the agent publishes to the terminal, including existing
tmux mirrors. Formats cover Codex, Claude Code, OpenCode, Qwen, Pi and Gemini's
dynamic activity summary, plus any other recognized or configured agent that
publishes a useful title. Some titles describe the whole session rather than each
prompt. No hooks, extra model calls or agent configuration changes are needed;
agents that do not expose a title keep the terminal name as fallback.

Live Diff is read-only and displays the current Git worktree changes against
`HEAD`, including staged, unstaged and untracked files. It does not establish who
edited a file: pre-existing edits and changes from other processes can appear.
Newly detected lines keep a blue background while they remain in the patch. Only
new lines receive a brief shimmer; later edits add more blue lines.
Discovery is best-effort (process directories and linked worktrees), and you can
add a local path explicitly. Binary/oversized changes have no line count, and
very large change lists are visibly limited. It does not alter agent status.

Local profiles recognize live controls for Codex, Claude Code, Gemini, OpenCode,
Amp, Antigravity, Cline, GitHub Copilot, Cursor Agent, Devin, Droid, Grok,
Hermes, Kilo, Kimi, Kiro, Letta, Maki, Muse, Pi, Qoder and Qwen, with supported
status titles for some agents. OMP and MastraCode are identified but have no
reliable local activity profile. It installs no hooks and
changes no agent configuration. Process identity and activity are heuristic;
unsupported agents and unrecognized screens can remain unknown. For a private or
renamed CLI, register its executable/module in **Terminal → Additional agent
commands** to identify it; this does not add a state profile. See the
[activity contract and Herdr research](docs/design/terminal-agents.md) for details.
The fold state of the predefined folders and the folder placement of tmux panes persist per project in
Tuiminal's user data directory; the opened project is not modified. The Master Key and additional
recognition rules persist in settings. On systems with tmux, terminals created by
Tuiminal are persistent windows in the shared session `tuiminal` and return in
**Tuiminals** after the app reopens. Closing Tuiminal detaches its temporary clients;
`[X]` closes only the selected window.
Native terminals stop on application shutdown, while external tmux sessions are
only disconnected. Agent classification follows each explicitly mirrored pane,
including panes in windows containing multiple agents.

<a id="interface-e-personalização"></a>

## Interface and customization

`[,]` opens the contextual settings center. Wide terminals use a category sidebar and a
focused detail pane; narrow terminals show one category at a time. Use `[J/K]` or
`[↑/↓]` to move between categories and `[H/L]` or `[←/→]` to change the current
option. Changes save automatically without remounting editors, losing focus, or
clearing tool state.

When Git is active, five entries appear without number prefixes: Diffs under
**GIT**, and Pull Requests, Issues, Repositories, and Browser under **GITHUB**. `[J/K]`
or `[↑/↓]` moves the focus and immediately renders that row's detail. Only the
focused row shows a blue `[Enter]`; `[Enter]` or `[L]` transfers keyboard focus to
the detail pane. A blue left rail marks the pane with focus. Inside a Git detail,
`[J/K]` navigates its rows and `[Esc]` returns to the category list. `[Ctrl+P]` in
Diffs opens this same center directly on the local project and branch controls.

- **Color mode:** Dark or Light.
- **Palettes:** Prime, Midnight, Nord, Gruvbox, Dracula, Catppuccin, and Tokyo Night.
- **Layout:** Framed, with gaps and full borders; or Compact, with more content space and a focus rail per panel.
- **Languages:** Brazilian Portuguese, English, Spanish, Japanese, Simplified Chinese, and Korean.
- **Tutorial:** an active-tool tour using simulated data without real service access.
- **Mouse:** tabs, lists, buttons, fields, commits, diffs, scrolling, and splits remain clickable.
- **Notifications:** information, success, warnings, and errors without stealing focus.

Preferences live in `~/.config/tuiminal/settings.json`. An invalid palette name falls back to Prime while preserving other valid preferences. Translating repeated error/warning prefixes does not truncate text or depend on call-stack depth.

<a id="desenvolvimento"></a>

## Development

The npm distribution does not require Bun for end users. The development checkout uses **Bun 1.4.2**, recorded in `.bun-version` and `package.json`:

```bash
git clone https://github.com/DeividXupon/tuiminal.git
cd tuiminal
bun install --frozen-lockfile
bun run dev
```

Development uses the same installer with locally generated payloads and a separate
cache. After editing a feature, restart `bun run dev` and install its new snapshot.
If you rebuild separately with `bun run build:features`, restart the application
before installing. No npm publication is needed. See the
[installation contract](./docs/design/official-feature-installation.md).

Main commands:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Build local feature payloads and launch the installation flow |
| `bun run build:features` | Rebuild the five installable official payloads |
| `bun run test:unit` | Test rules and local integrations |
| `bun run test:tui` | Test native UI and loading of the five built feature payloads |
| `bun run check` | Types, formatting, lint, workspaces, architecture, maintainability, and tests |
| `bun run check:workspaces` | Check package versions, exports, and dependencies |
| `bun run build:packages` | Generate JavaScript, types, and manifests for six internal modules |
| `bun run test:packages` | Pack and install modules in a temporary consumer |
| `bun run check:licenses` | Check the reproducible production license inventory |
| `bun run docs:demos` | Recreate the installer and five tool GIFs from the real UI |
| `bun run build:release` | Build platform distribution packages |
| `bun run test:release` | Check hashes, tarballs, and final installation without Bun in `PATH` |

`bun run docs:demos` uses simulated data or a temporary repository, never user credentials or services. Final frame conversion requires [ImageMagick](https://imagemagick.org/).

Before contributing, read:

- [Contribution guide](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Release process](./docs/release-process.md)
- [Project architecture](./docs/architecture.md)
- [Modular monolith decision](./docs/adr/0001-modular-monolith.md)

English is the primary documentation language. Keep this README and [README.pt-BR.md](./README.pt-BR.md) synchronized when shared content changes.

<a id="arquitetura-e-próximos-passos"></a>

## Architecture and next steps

The code uses a **Bun workspaces monorepo**. `apps/cli` composes the application,
`packages/core` holds shared infrastructure/components, and
`packages/feature-{git,database,runner,http,terminal}` contains the five tools. Each
package has its own `package.json`; `bun install` links `workspace:*` dependencies
locally without manual links.

The six modules emitted by `bun run build:packages` live in `dist/packages` and
point to their directories in this repository. Their contracts are internal and
versions follow the CLI. Source manifests remain private; packaging prepares
artifacts without publishing them. Current npm distribution remains the `tuiminal`
launcher with a minimal platform binary and five separately installed official payloads.

The [alpha readiness checklist](./ALPHA_READINESS_PLAN.md) records local hardening
and outstanding alpha acceptance. It is not release approval or a newly published
npm version.

Database, Git, Runner, HTTP, and Free Terminal are official internal Tuiminal
features. A public SDK, marketplace, and community plugin loader are not planned.
The minimal installation downloads compatible official components on demand,
managed by Tuiminal without modifying the user's opened project.

The [HTTP client plan](./HTTP_CLIENT_PLAN.md) records that tool's next steps.
Maintained Git interface specifications and contracts are in:

- [Git Diffs and Pull Requests](./docs/design/git-pr-interface.md)
- [Git Issues](./docs/design/git-issues-interface.md)
- [Git Inbox](./docs/design/git-inbox-interface.md)

<a id="licença"></a>

## License

Copyright 2026 DeividXupon.

Distributed under the [Apache License 2.0](./LICENSE). You may use, modify, and
distribute Tuiminal, including commercially, while preserving the terms and notices
required by the license. Bundled component notices are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
