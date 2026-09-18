# Runner commands, dependencies and saved flows

Runner discovers project commands and owns the process sessions it starts. It reads
project configuration; editing through the TUI never writes configuration into the
opened project. See [agent notes](../ai/runner.md) for discovery, logs, keyboard
scope and process shutdown constraints.

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
in parallel. Ordinary multi-selection groups remain parallel when no dependencies
are configured. Separate runs own separate process instances.

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
`tests/tui/runner-yaml-highlighting.test.tsx` covers native colors, cursor, undo and theme changes.
`tests/runner-plan.test.ts` covers graph validation and scheduling;
`tests/runner-yaml.test.ts` covers structured YAML, comments, canonical paths, conflicts,
legacy state and completion. `tests/runner-editor.test.ts` covers field validation, canonical storage, overrides
and trust; `tests/tui/runner-configuration.test.tsx` exercises native keyboard,
mouse, editor validation, persistence and real owned process sequences. Existing
Runner health, PTY, discovery, session, log and TUI regressions remain required.
