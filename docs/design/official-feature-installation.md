# Official feature installation

Tuiminal ships a minimal platform executable and installs its five first-party tools
on demand. This is an internal distribution contract, not a plugin API. All tools
are maintained in this repository and use exactly the CLI version.

## User flow

An empty installation opens **Install official features** after the startup animation.
Select Database, Git, Runner, HTTP, or Free Terminal with `[↑/↓]`, `[J/K]`, or the
mouse. `[Enter]` installs the selected tool, then opens it after installation.
`[Space]` selects several tools and `[I]` installs that selection sequentially.
`[C]` cancels the active download; already completed installations are retained.
A failed installation stays on screen with an explicit retry action.

Installed rows expose **[D] Uninstall** beside Open. The focused row accepts `[D]`;
mouse activation targets that exact row. A confirmation names the tool and explains
that its sessions will close and unsaved changes will be discarded, while projects
and saved settings remain. `[Y]` confirms once; `[Esc]` or the backdrop cancels only
the confirmation. The dialog blocks global shortcuts and background interaction.

Uninstall first unmounts the selected tool's workspace, then awaits shutdown of its
owned resources before removing its exact version/hash directory. Other tools and
other cached versions remain intact. The controller serializes this with opening,
installation and repeated removal requests. A failure stays visible with an explicit
retry; a retired workspace only reopens on user activation. After removal, the tab
disappears and the row offers Install again. Removing the last tool keeps the
installer open; isolated mode never falls back to a sibling tool. Imported modules
may remain cached in memory until exit, but cannot be opened without reinstalling
the verified payload.

Rows describe each tool's capabilities in the selected UI language. Hover or
keyboard selection updates a single recognizable animated icon: a storage cylinder
for Database fills from the bottom, holds its data, then empties for the next cycle.
Runner shows a play icon while a progress line advances, then a completion check.
HTTP sends a rightward request from a client to a server, then a leftward response
and a client acknowledgement. Git retains its branch and Free Terminal its window
with a blinking cursor. Motions express each tool’s purpose rather than generic
highlights traveling around an outline. Compact icons preserve these same phases.
These illustrations use deterministic geometry without commands or sample records,
never load tool modules, and perform no real I/O. A single 120 ms clock cycles 48
frames, restarts for the selected tool, pauses behind settings, and is cleared on
unmount.

Terminals at least 100 columns wide and 22 rows tall show the icon beside the
list, without a preview heading. Smaller terminals use a two-row icon below it,
preserving wrapped descriptions and installation controls. Animation updates keep native renderables
and multiselection intact. Hover does not scroll the list during a pending click;
keyboard navigation and resize reveal the selected row after React commits and
native layout completes, including rows as tall as the viewport (which OpenTUI's
nearest-edge helper otherwise leaves unmoved).

While downloading, only the active tool's row receives a subdued background fill
from left to right, proportional to actual received/total bytes and clamped to
0–100%. Text, selection, and controls keep their positions. Unknown progress has
no fill; completion, cancellation, and errors remove it. No invented progress or
extra animation timer is used for downloads. The fill has an explicit lower
stacking order than labels and descriptions; native span regressions verify text
foreground colors, since character-only captures can miss an obscured glyph.

Settings includes **Official features → [Enter] Manage features** in every context.
Opening this screen retains mounted workspaces, editor buffers, and owned processes,
while blocking their input. `[Esc]` returns to the previous tool; with no available
tool it exits. Only installed tools appear in navigation, keeping their original
`[Alt+1]` through `[Alt+5]` numbering. An uninstalled tool shortcut opens the installer.
Runner remains the default when installed; otherwise the first installed tool is
used. An isolated command for an absent tool opens the installer and does not
initialize another tool as a fallback. Other tools may be installed there, but their
Open actions remain unavailable until launched outside that isolated mode.

Noninteractive installation is available through:

```sh
tuiminal features install git runner
tuiminal features install all
tuiminal features
```

HTTP headless commands fail with installation guidance when HTTP is missing. They
never implicitly download code or enter a UI. Installation does not start commands,
connect to a database, or authenticate with GitHub.

## Storage and verification

The CLI embeds its trusted catalog during compilation. The catalog contains exact
version, filenames, compressed sizes and SHA-256 hashes, plus every expanded file's
size and hash. It is not replaced by downloaded metadata.

Production downloads use:

```text
https://github.com/DeividXupon/tuiminal/releases/download/v<VERSION>/tuiminal-<VERSION>-<TOOL>.json.gz
```

Each artifact is gzip-compressed JSON containing named base64 ESM files. Names must
match the tool's fixed entrypoint and license/notice list; archive paths and arbitrary extraction are
not supported. Compressed downloads are bounded to 32 MiB and expanded JSON to
64 MiB. HTTP errors, truncation, excess bytes, wrong versions and mismatched hashes
fail closed before installation. HTTPS redirects are bounded; credentials and
non-loopback HTTP destinations are rejected. The operation has a two-minute deadline
and owns cancellation. No automatic retries or install scripts run.

Files are written with mode `0600` into private staging directories, then renamed
into a complete installation. Storage validates directories and rejects symlinked
entries; concurrent successful publications converge on the same content. Failed or
cancelled operations remove their own staging files. Corrupt content is considered
uninstalled and can be replaced explicitly.

Release installations use `<data-home>/tuiminal/features/<version>/<id>-<archive-hash>`.
Development uses `dev-features` instead of `features`. `data-home` is `XDG_DATA_HOME`,
or `LOCALAPPDATA` on Windows, otherwise `~/.local/share`. Installation never writes
to the opened project or its `node_modules`. Versions and changed development hashes
remain isolated. Old versions are not auto-loaded or automatically deleted.

Every file is bounded and hashed again before activation. Bun imports a Blob URL
created from those verified bytes, eliminating a path lookup between verification
and code execution. A private host binding supplies the actual shared React,
OpenTUI, Tuiparts and core module instances; payloads cannot bundle another React
runtime. Only the active/explicitly opened tool is imported. Imports are deduplicated.

SQLite's downloaded worker runs through the same executable using an internal IPC-only
entrypoint. The minimal npm package contains no separate full Bun SQLite executable.
The emitted source packages retain their JavaScript helper fallback.

## Development and release

`bun run dev` and `bun run start` build local payloads before startup and exercise the
same installation/verification flow using those files. No npm publication is needed.
Changes to feature source require rebuilding payloads (`bun run build:features`, or
restarting `bun run dev`), restarting the application, and installing the newly
generated tool. Running `bun run dev` performs the build and launch together. The CLI's watch
mode alone does not rebuild an installed feature snapshot.

`TUIMINAL_SOURCE_FEATURES=1` is an explicit repository-test escape hatch. The release
build replaces that source loader with a stub and rejects any feature implementation
in its dependency graph, so an inherited flag cannot enable bundled tools. Tests use
fixture storage and never install into the user's cache.

`build:features` emits `dist/features/<version>/catalog.json` and five archives.
The release-candidate workflow builds these once, then supplies the same artifacts to
all six native builds through `TUIMINAL_RELEASE_FEATURES_DIR`. Each build validates
all archives before embedding the catalog. `TUIMINAL_FEATURE_BASE_URL` can select a
mirror for smoke tests; it cannot override the embedded hashes. Production rejects
file URLs; development also permits local payload files.

Publish the exact five canonical archives on the matching GitHub release **before**
exposing the npm launcher version. Do not rebuild or overwrite artifacts under an
existing version. See [release process](../release-process.md).

## Evidence

- `tests/feature-installation.test.ts`: catalog bounds, archive/file identity,
  concurrent publication, tamper detection/repair, cancellation, progress, no replay,
  isolated initialization, verified-byte imports and all six language catalogs.
- `tests/tui/feature-installer.test.tsx`: initial empty screen, keyboard/mouse installs,
  installed-only navigation, settings access, retained Runner tree and small terminals;
  uninstall confirmation, shortcut isolation, real Runner process shutdown before file
  removal, last-tool removal, isolated mode, fallback navigation and reinstallation.
- `tests/feature-uninstallation.test.ts`: exact payload removal, retained settings and
  other versions, symlink boundaries, serialized retirement/removal, failure recovery,
  partial filesystem failures and disposal during retirement.
- `tests/feature-preview.test.ts` and `tests/tui/feature-preview.test.tsx`: translated
  descriptions, bounded simulated frames, hover/keyboard selection, resize, retained
  renderables, blocked input, and timer replacement/pause/cleanup.
- `test:release`: minimal binary graph guard, exact npm tarballs, clean installation,
  pinned loopback downloads, installed HTTP request and downloaded SQLite worker IPC.
- Native CI covers all six release targets; local macOS validation does not establish
  Linux or Windows native acceptance.
