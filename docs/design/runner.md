# Runner commands, dependencies and saved flows

Runner discovers project commands and owns the process sessions it starts. It reads
project configuration; editing through the TUI never writes configuration into the
opened project. See [agent notes](../ai/runner.md) for discovery, logs, keyboard
scope and process shutdown constraints.

## Action palette

`[?]` opens the shared searchable action palette from the workspace. The footer's
`[?]` button works with the mouse; `[A]` in Single and `[Shift+A]` in Multi remain
aliases. The palette replaces the expanded More panel and groups command, process,
log and navigation actions. Unavailable actions explain their requirements.
Opening or searching does not run a command. Selecting an action restores workspace
focus before invoking the existing handler, including configuration and trust guards.
Text inputs, project pickers and other modals retain their keyboard input. `[Esc]`
leaves the palette search first, then closes the palette and restores focus.

The command list selects one command at a time. `[Enter]`, `[Space]` or a click starts an idle command or stops its active
execution. Activating it while stopping does nothing. `[Shift+K]` is no longer bound;
process stop buttons and the palette action remain available. `[Space]` only activates commands while their list is focused;
inputs and modals retain their keys.
Use saved flows for coordinated execution of multiple commands.

`[M]` opens box selection for visible command/process lists, logs, expanded history
and individual Multi process panes. The selected box is tinted; arrows or `[H/J/K/L]`
move spatially, `[Enter]` or a click focuses it, and `[Esc]` or `[M]` cancels.
Selection consumes workspace keys and never starts or stops a command. Inputs,
project pickers and modals retain their keys. `[Shift+M]` toggles Single/Multi outside
those input scopes. `[Ctrl+M]` remains an alias only when the terminal reports it
distinctly from Enter; legacy terminals send the same byte for both keys.

The command footer also exposes Multi, history, environment, saved-command removal,
and log copy, export and clearing. The log footer exposes list focus, scrolling,
filtering, stream selection, timestamps, copy, export, clearing, Multi and history.
Actions without a valid target stay disabled.
Both footers wrap using translated display widths, and the workspace reserves each footer's
full height so every action, including `[?]`, remains visible on narrow terminals.
The header places `[N] New tab` between the opened project tabs and command summary.
Clicking it opens the same project picker as `[N]` to add another project tab.
The `[/]` button sits beside the command input and focuses it, matching the keyboard
shortcut. `[P]` switches command/process lists and `[D]` refreshes discovery through
the command-panel header or keyboard. These controls stay outside the footer.

## Execution status colors

Project tabs show status through the project name's color, without a state symbol
beside the name. Command rows keep names white in every state, with a colored
indicator and no status text; the command line stays on the second row. Process/history
rows and log headers use semantic theme colors alongside state symbols and
localized text. Running uses the Runner
accent; success is green, failures or unhealthy services red, checking/stopping
yellow, and idle or interrupted states muted. Selection backgrounds and focus
borders remain independent of execution status. User command and project names
are plain data, never shortcut hints.

Command rows show an active execution if one exists, otherwise the latest retained
result. Starting a new execution replaces that command's previous outcome in the
summary; older attempts remain available in history. Nonzero exit codes accompany
failed execution labels. Existing history retention limits are unchanged.

The header summary belongs to the selected project. It counts running/stopping
instances and the latest failed/unhealthy or successful result per command.
Inactive project tabs retain their status color, with failures taking precedence
over shutdown, health checks, running processes and completed results. Labels
compact to symbols when space is limited.

Single and Multi log headers distinguish process state from health: a running
process can still be checking or unhealthy. Flow steps use green for success,
red for failure and yellow for pending/starting/blocked steps. Runner notices use
their info, success, warning or error color, including the shared notifications.

## YAML configuration editor

`[Ctrl+Y]` opens the project's complete YAML document directly inside the Runner.
Plain `[E]` continues cycling environment profiles.
The editable file lives at `~/.config/tuiminal/runner/<project-hash>/runner.yaml`
(or the XDG config equivalent); its path appears above the editor. The hash uses
the canonical project path. Project files remain read-only.

Use ordinary text editing, selection and multiline paste. `[Enter]` indents the
next line according to the current mapping, list or literal command block;
`[Tab]` inserts two spaces. Read-only recommendations appear below the cursor while typing
YAML keys and supported values. The list is scoped to the current YAML block,
with a short description of the selected option beside it. Close typos rank
likely alternatives from that block; unrelated text closes the list. `[Ctrl+Space]` opens recommendations
explicitly; `[Ctrl+J/K]` or a mouse click selects a description to inspect.
Immediately after `flows:` and `[Enter]`, the list shows a flow ID example (`dev:`).
As the user types another ID, it shows that ID with the required colon; after the
ID and another `[Enter]`, it suggests flow fields such as `label` and `stages`.
The same ID guidance applies to `commands`, `profiles`, and environment maps.
Recommendations never insert text; the user types keys and values. Plain
arrow keys move the YAML cursor and the panel follows it; `[Enter]` inserts a new indented line even
while suggestions are visible. Documentation follows the current YAML key.
`[Esc]` closes suggestions first, then returns to command/flow management. Closed editors retain
no keyboard listeners. Opening a document or inspecting a recommendation never runs it.

The editor colors YAML keys, strings, numbers, booleans/null, comments and
punctuation using the existing YAML parser, including incomplete drafts. Literal
command blocks remain strings. Highlighting uses terminal display columns and the
shared light/dark syntax palette without replacing the native text buffer.

`[Ctrl+S]` validates and saves the exact YAML text, preserving comments and multiline
commands. Syntax errors, unknown fields, invalid policies, health checks, missing
references and cycles prevent saving. Working directories are checked before the
write. Conflicting external edits are preserved and reported instead of overwritten.
Saving returns to the commands/flows list. `[Esc]` returns there without saving,
so save edits before leaving. The list retains `[Ctrl+N]`
for a new command, `[Ctrl+F]` for a new flow, `[Enter]` to edit a definition in the
YAML, and `[Ctrl+Y]` to reopen the entire document. All actions have mouse controls.

The document contains `commands`, `flows` and optional `profiles` maps. Map keys
are stable IDs; `label` changes the display name. Commands accept `description`, literal `command`,
`cwd`, an `env` mapping, `profile`, `envFile`, `interactive` (PTY), `restart`,
`restartDelayMs`, `maxRestarts`, `health`, `dependsOn`, `autostart`, and `persistLogs`.
PTY and autostart default to false; restart defaults to `never`. Environment scalar
values become strings, and command values override the selected profile. Relative
paths resolve against the project root. Profiles accept `label`, `env` and `envFile`.

Health checks use YAML maps: `type: log` with `pattern`, `type: port` with `port`
and optional `host`, or `type: http` with an HTTP(S) `url`. `timeoutMs` accepts
500–600000; restart delays accept 100–300000 ms and limits accept 0–100.

## Dependency plans

A command's `dependsOn` list contains `{ commandId, condition }` entries. References
may use exact IDs or unambiguous display names. Existing Tuiminal YAML can declare:

```yaml
commands:
  build:
    command: bun run build
  api:
    command: bun run dev
    dependsOn:
      - commandId: build
        condition: completed
    health:
      type: http
      url: http://127.0.0.1:3000/health
      timeoutMs: 30000
  smoke:
    command: bun run smoke
    dependsOn:
      - commandId: api
        condition: started
```

`completed` requires successful process exit. `started` requires process startup
and, when configured, a successful health check. A process that exits before its
health check succeeds cannot release dependents. Omitted conditions mean
`completed`. A failure, health timeout or cancellation permanently blocks pending
transitive dependents in that run; an automatic retry does not erase the failure.
Already started independent branches can continue.

Before spawning, Runner resolves the entire reachable plan, rejects missing or
ambiguous references and cycles, and snapshots the commands. A prerequisite shared
by multiple targets is launched once within that plan. Independent roots launch
in parallel. Separate runs own separate process instances.

## Saved flows

A flow has a stable ID, name, autostart flag and ordered stages. Each stage contains
parallel command IDs and a condition controlling the next stage:

```yaml
flows:
  development:
    label: Development
    autostart: false
    stages:
      - commandIds: [build]
        waitFor: completed
      - commandIds: [api, worker]
        waitFor: started
      - commandIds: [smoke]
        waitFor: completed
```

Here `build` must finish successfully; `api` and `worker` start together; `smoke`
waits for both services' readiness. Command dependencies also apply. Commands may
appear only once in explicit stages; contradictions between stage order and
command dependencies are rejected as cycles.

In the configuration list, a selected flow exposes `[Ctrl+R]` Run, `[Ctrl+K]` Stop
and `[Ctrl+T]` Restart, plus mouse controls. Per-command states show waiting,
starting, started, healthy, success, failure, stopped or blocked. Stop cancels
queued stages, health probes and automatic restart delays and stops only that
flow's process instances. Restart waits for owned executions to finish stopping
before constructing a fresh plan. Opening, editing, saving or accepting a
recommendation does not run a flow.

## Persistence and trust

The global YAML file stores commands, local overrides, flows and profiles. On the
first edit, existing saved commands and flows are included alongside detected
commands; creating the file requires an explicit save. Existing `runner.json`
remains intact and continues to store sessions and history. Projects without a
YAML file retain the previous saved-definition behavior. Once a YAML exists,
manual quick-save and flow operations update that file, preserving its comments.

Canonical project paths make symlink aliases share definitions. Stable IDs keep
dependency references intact when labels change. Editing a detected/imported
command stores a local override with its original ID; `package.json`,
`.tuiminal/runner.yaml`, `mprocs.yaml` and Procfiles remain untouched. Writes use
restricted permissions, atomic replacement, backups and conflict checks. Invalid
YAML is preserved and can be repaired in the editor; its definitions do not start
automatically. Other projects, sessions and history remain independent.

Approval reviews the canonical root, expanded prerequisite commands, flow stages,
directories, profiles, environment variable names/files, PTY and process policies.
The trust fingerprint includes material command, dependency, flow, profile and
environment-file changes. Trust files contain fingerprints, not environment values.
Editing suspends autostart; changed definitions require approval after leaving the
editor. Invalid autostart plans are reported and never execute.

Switching/closing a project tab does not stop its sessions. Leaving Tuiminal stops
all Runner-owned processes, probes and restart timers. Session restoration never
reattaches an orphaned live process. Log retention and explicit log export retain
the existing Runner contract.

## Verification

`tests/runner-yaml-syntax.test.ts` covers syntax tokens;
`tests/runner-status.test.ts` covers retained outcomes and project summaries;
`tests/tui/runner-status.test.tsx` covers native status colors, project switching,
history, scrolling, mouse selection, theme/language changes and health/flow states.
`tests/tui/runner-yaml-highlighting.test.tsx` covers native colors, cursor, undo and theme changes.
`tests/runner-plan.test.ts` covers graph validation and scheduling;
`tests/runner-yaml.test.ts` covers structured YAML, comments, canonical paths, conflicts,
legacy state and completion. `tests/runner-editor.test.ts` covers field validation, canonical storage, overrides
and trust; `tests/tui/runner-configuration.test.tsx` exercises native keyboard,
mouse, editor validation, persistence and real owned process sequences. Existing
Runner health, PTY, discovery, session, log and TUI regressions remain required.
