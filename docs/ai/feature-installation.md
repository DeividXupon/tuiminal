# Official feature installation

Use for payload building, verification, loading and removal.
Contract: [official installation](../design/official-feature-installation.md).
Entry points: [CLI feature host](../../apps/cli/src/features/),
[packaging](../design/internal-workspaces.md#packaging).

- Trust only the embedded catalog: exact version, sizes, compressed/per-file
  hashes and flat filename allowlist. Publish complete directories atomically,
  reverify at load and import verified bytes through Bun Blob URLs.
- Never run npm/install scripts in the opened project. Mirrors cannot override
  hashes; activation cannot download implicitly. Cancellation belongs to its
  controller and does not replay work.
- A competing installer may already have published a valid payload. Publish the
  prepared directory before considering repair; a stale invalid read does not
  authorize replacing a valid winner.
- Payloads bind to the host's exact React/OpenTUI/Tuiparts/core instances. Register
  shared imports in `apps/cli/src/features/host-modules.ts`. Keep exported values'
  references stable; expose changing state through functions or stable objects.
- Hidden helpers use fixed allowlisted payload names and internal host entrypoints,
  including the database worker and terminal project-sync worker; never run
  project-local executables. No duplicate runtime or live code replacement.
- Uninstall confirms the exact tool, retires its resources, then deletes only its
  current version/hash payload. Serialize with install/open; retain settings,
  projects and other versions. Failed retirement/removal does not remount the tool.
- Keep installed-only tabs and fixed Alt numbering. Isolated mode may install
  other tools but open only its requested tool. Retain mounted state behind the
  installer while suspending underlying keyboard input.
- Installer illustrations use no feature runtime or real I/O. One bounded clock
  pauses behind settings; animation cannot remount rows. Progress reflects actual
  received/total bytes and clears on cancel/error/completion.

`bun run dev`/`start` builds local payloads in separate `dev-features` storage;
rebuild/reinstall snapshots after feature edits. `TUIMINAL_SOURCE_FEATURES=1` is
an explicit test shortcut, stubbed out of releases.

Verify with [real payload TUI tests](../../tests/tui/feature-payloads.test.tsx);
source-loader tests cannot prove host bindings. Release checks and publication
order belong to [validation](validation.md#packaging-and-release).
