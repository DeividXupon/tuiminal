# Agent guidance map

`AGENTS.md` at the repository root is the entry point. This directory holds the
durable, task-specific engineering constraints that previously lived in one large
instruction file. Read the relevant document before changing that area; do not load
the entire directory for an unrelated task. Product specifications and current code
remain the source of truth when a note has drifted.

| Work area | Agent notes | Maintained specification or context |
| --- | --- | --- |
| Cross-tool UX, shortcuts, appearance, i18n, documentation | [Conventions](./conventions.md) | [Architecture](../architecture.md), [Shared controls](../design/ui-controls.md) |
| Official payload installation and release boundary | [Feature installation](./feature-installation.md) | [Official feature installation](../design/official-feature-installation.md) |
| Git Diffs, PR, Issues, Inbox | [Git](./git.md) | [PR](../design/git-pr-interface.md), [Issues](../design/git-issues-interface.md), [Inbox](../design/git-inbox-interface.md) |
| Runner and process ownership | [Runner](./runner.md) | [Runner](../design/runner.md), [Architecture](../architecture.md) |
| HTTP client, Postman account access, and headless execution | [HTTP](./http.md) | [Postman account](../design/postman-account.md); [HTTP_CLIENT_PLAN.md](../../HTTP_CLIENT_PLAN.md) for future-facing work |
| Free Terminal, PTY, and remote connection profiles | [Terminal](./terminal.md), [Remote profiles](./terminal-remote.md) | [Terminal workspace](../design/terminal.md), [Agent activity](../design/terminal-agents.md), [Architecture](../architecture.md) |
| Database and SQL | [Database](./database.md) | [Architecture](../architecture.md); [future priorities](../plans/database-next.md) |
| Tests, packaging, CI, releases | [Validation](./validation.md) | [Release process](../release-process.md) |

Keep this map and the root `AGENTS.md` short. Add a new durable rule to the narrowest
relevant note or maintained specification, and update links when a document moves.
Do not duplicate a rule in multiple agent notes. If a change is user-facing, update
both language versions of the README in the same change.

The [shared control contract](../design/ui-controls.md) and
[architecture](../architecture.md) record the completed code-consistency audit
and its intentional ownership boundaries.
