# Runner

Use for command discovery, process execution, plans, YAML and trust.
Contract: [Runner](../design/runner.md), especially
[dependency plans](../design/runner.md#dependency-plans) and
[persistence/trust](../design/runner.md#persistence-and-trust).
Code: [feature](../../packages/feature-runner/src/); scheduling belongs to
`model/plan.ts`/`services/plan-run.ts`, execution to `use-runner-execution`,
orchestration to `use-runner-plans`.

## Preserve

- Launch opens the invocation's canonical project; restored tabs are scoped to it.
  A valid Git root needs a real HEAD or linked-worktree marker, not an empty,
  malformed or symlinked `.git`. Discovery deduplicates paths and retains its
  bounded depth, concurrency and project count.
- Read startup settings/config once for sibling consumers. Detector output must
  target the selected project; test exact argv, including wrappers, Go `./...`,
  Python fallback and quoted Deno JSONC tasks.
- Selecting a running command reopens it; only explicit restart/new-instance
  actions spawn again. Closing/switching project tabs leaves processes alive;
  session restoration never reattaches orphan processes.
- Autostart is only explicit Tuiminal `autostart: true` plus approved material
  fingerprint. Review expanded commands, roots, directories, profiles, environment
  key names/files, PTY and policies. Imported mprocs/Procfiles gain no implicit
  trust. Editing suspends autostart; material changes revoke approval.
- Validate the reachable plan before spawning, run shared prerequisites once,
  and permanently block pending transitive dependents after failure/cancel/timeout.
  Stop owns processes, probes and restart timers; restart waits for retirement.
- The YAML editor writes only global project-hashed storage, preserves comments
  and stable IDs, and checks the opening hash before save. Quick-save updates
  existing YAML; legacy JSON sessions/history remain intact. Editing or suggestions
  never execute commands. PTY is an explicit opt-in for saved manual commands.
- Each PTY streams UTF-8 across chunks, emits prompts immediately, flushes its tail
  once and ignores stale callbacks. Keep native renderables stable across views.
- Logs use the bounded circular buffer and shared batched native formatter;
  translate only generated system entries. Clear pending output with visible logs,
  flush on completion, and persist only by opt-in or explicit export.
- Port probes never overlap and cancel only their helper. Health probes share
  one total deadline and release bodies, sockets, timers and listeners.
- Shutdown waits for owned groups: SIGTERM, one-second grace, then exact-group
  SIGKILL if needed. Retire escalation timers; expose bounded shutdown failure.

Tests: `tests/runner-*.test.ts` and `tests/tui/runner-*.test.tsx`.
Use real owned process tests for lifecycle changes and the specification's
[verification map](../design/runner.md#verification) for plans/editor/trust.
