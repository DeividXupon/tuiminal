# Tuiminal

Integrated terminal workspace: Bun, OpenTUI, React and tuiparts. All tools are
first-party; there is no public plugin API. The CLI must work from any project.

## Working rules

- Inspect the worktree and preserve existing user changes.
- Use Bun 1.4.2 (`.bun-version`). Run focused checks for the affected behavior;
  see [validation](docs/ai/validation.md) for test, CI and packaging work.
- Before an explicitly requested commit, run `bun run check`,
  `git diff --check` and task-specific gates once after final changes.
- Commit, push, publication, visibility changes and killing user processes require
  an explicit user request. Stop only resources owned by the current work.
- Tests, demos and payloads must not modify the opened project or use real
  credentials, databases or unrelated processes. The remote MySQL suite is the
  sole opt-in exception: use a dedicated non-production database, synthetic data,
  complete `TUIMINAL_TEST_MYSQL_*` configuration and owned prefixed objects only.

## Boundaries

- CLI composes core and feature exports; features import neither each other nor
  CLI; core imports no feature. Models stay free of UI, services and I/O.
- Share behavior only when ownership matches; preserve feature focus and cleanup.
- Localize fixed UI text. Use bracketed shortcuts and `InlineButton` for inline
  actions; never style user data as shortcut hints. Mount modals only while open
  and consume their own `[Esc]`.
- Maintained Markdown is English. Update both READMEs when shared user-facing
  content changes.

## Read only for the task

Use the [guidance map](docs/ai/index.md) to select the relevant area; skip unrelated
notes. Read the relevant section of a maintained specification before changing
its contract. Code and tests establish current behavior; future plans do not.
For an isolated prose edit, read the edited document and check its links.
