# Agent guidance map

Select the row for the task. Notes contain implementation constraints and entry
points; follow specification links only for the behavior being changed. This is
a routing map, not a required reading sequence.

| Task | Read |
| --- | --- |
| Shared UI, focus, shortcuts, i18n, tutorials or documentation | [Conventions](conventions.md) |
| Package boundaries, exports or initialization | [Architecture](../architecture.md), [workspaces](../design/internal-workspaces.md) |
| Official payload build, install, load or uninstall | [Feature installation](feature-installation.md) |
| Local Git, PR, Issues or Inbox | [Git](git.md) |
| Command discovery, execution, YAML or process ownership | [Runner](runner.md) |
| Interactive/headless HTTP or Postman | [HTTP](http.md) |
| PTY, tmux, sidebar, agent observation or Live Diff | [Terminal](terminal.md) |
| SSH aliases, readiness or remote Codex transport | [Remote Terminal](terminal-remote.md) |
| Connections, SQL, grids or staged writes | [Database](database.md) |
| Tests, static gates, CI, packaging or releases | [Validation](validation.md) |

## Maintaining guidance

- Root `AGENTS.md`: repository-wide rules. These notes: area-specific pitfalls.
  `docs/design/`: current contracts. `docs/adr/`: decisions and rationale.
- Write short, actionable rules with a concrete scope. Link to the owning code,
  test or specification instead of copying behavior catalogs or procedures.
- Add a rule only when it prevents a recurring mistake not already covered.
  Replace obsolete guidance; omit progress logs, incident narratives and secrets.
- Keep future work in plans: [HTTP](../../HTTP_CLIENT_PLAN.md),
  [Database](../plans/database-next.md), [alpha readiness](../../ALPHA_READINESS_PLAN.md).
  They do not override implemented behavior.
- Run `bun run check:ai-docs` after guidance edits. Repository budgets are 3 KiB
  for the root/map, 8 KiB per note and 48 KiB total; these are ceilings, not targets.

Rationale and external references: [ADR 0002](../adr/0002-agent-guidance-map.md).
