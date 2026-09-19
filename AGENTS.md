# Tuiminal agent guide

Tuiminal is one integrated terminal developer workspace built with Bun, OpenTUI,
React, and tuiparts. Database, Git, Runner, HTTP, and Free Terminal are first-party
tools, not a public plugin platform. The CLI must work from any project directory.

## Before changing code

1. Inspect the current worktree and keep existing user changes intact.
2. Read [the agent guidance map](docs/ai/index.md), then the notes for each area
   touched by the task. For cross-tool UI, shortcuts, focus, i18n, or documentation,
   read [cross-tool conventions](docs/ai/conventions.md). For tests, CI, packaging, or
   release work, read [validation and release](docs/ai/validation.md).
3. Read the corresponding maintained specification under `docs/design/` before
   changing a completed feature's contract. Treat `HTTP_CLIENT_PLAN.md` and
   `ALPHA_READINESS_PLAN.md` as future-facing plans, not descriptions of current code.
4. Confirm behavior in code and tests; notes can lag implementation.

## Architecture and implementation

- Keep the dependency direction: `apps/cli` composes `packages/core` and feature
  exports; features never import each other or the CLI; core imports no feature.
  See [architecture](docs/architecture.md) and
  [internal workspaces](docs/design/internal-workspaces.md).
- Prefer a shared core control or helper when the same behavior and ownership recur
  across tools. Preserve feature-specific content, keyboard scope, focus lifecycle,
  appearance, and resource shutdown; do not create a generic abstraction merely for
  similar-looking JSX.
- Keep fixed UI text localized and shortcuts bracketed. `InlineButton` is the
  standard one-line action; `ShortcutText` styles keyboard hints, never user data.
  Modals consume their own `[Esc]`, and closed modals must not retain listeners.
- Do not modify the user's opened project or real credentials while building docs,
  demos, fixtures, or feature payloads.

## Documentation and handoff

- English is canonical for maintained Markdown. Update `README.md` and
  `README.pt-BR.md` together whenever shared user-facing content changes.
- Put durable cross-tool rules in `docs/ai/conventions.md`, domain-specific agent
  rules in the matching `docs/ai/` note, current feature contracts in `docs/design/`,
  and decisions in `docs/adr/`. Update the map and links when moving a document.
- Use Bun 1.4.2 from `.bun-version`. During ordinary implementation prompts and
  handoffs without a commit, do not run tests, typechecking, lint, build validation,
  `git diff --check`, or any other automated check command. Add or update regression
  coverage as code, but defer executing it. Only when the user explicitly requests a
  commit, run `bun run check`, `git diff --check`, and any task-specific required gate
  once immediately before creating that commit.
- Do not commit, push, publish, change visibility, or kill user processes unless the
  user explicitly asks. Stop only resources owned by the current test or workspace.

## Task-specific notes

- [Official feature installation](docs/ai/feature-installation.md)
- [Git](docs/ai/git.md)
- [Runner](docs/ai/runner.md)
- [HTTP](docs/ai/http.md)
- [Free Terminal](docs/ai/terminal.md)
- [Database](docs/ai/database.md)
- [Validation and release](docs/ai/validation.md)
