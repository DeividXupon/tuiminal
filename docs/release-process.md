# Release process

The current candidate is `0.2.0-alpha.0`, targeting the npm `alpha` channel. Building a candidate does not authorize publication.
Publishing requires an immutable commit approved by the maintainer, a green gate on
that exact SHA, and native validation of all six advertised platform packages.

## 1. Prepare the candidate

1. Agree on the version and npm channel with the maintainer; never move `latest`
   by assumption. Update the root version, `apps/cli`, and every package in `packages`,
   including exact internal peer versions. Workspace checks and builds reject drift.
2. Install with Bun 1.4.2 and confirm that the lockfile remains unchanged:

   ```sh
   bun install --frozen-lockfile
   bun audit --json
   bun run check
   bun run test:packages
   git diff --check
   ```

3. Regenerate `THIRD_PARTY_NOTICES.md` with `bun run docs:licenses` when the production
   dependency tree or Bun runtime changes. `bun run check:licenses` rejects a stale
   inventory. The inventory preserves notices but does not replace legal review,
   particularly for transitive obligations in the compiled runtime.
4. Regenerate the installation and all five tool demos with `bun run docs:demos` after material layout or
   workflow changes, and visually review the GIFs.
5. Push the candidate branch or manually trigger `Release candidate matrix`. This workflow has only `contents: read`,
   receives no npm credential, and contains no publishing step. A build, test, or
   packaging failure therefore stops the job without publishing.

## 2. Matrix and artifacts

The workflow uses native runners for `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64`, `win32-x64`, and `win32-arm64`. A preceding job builds the five official feature archives once and stores them in
the `official-features` workflow artifact. All native builds consume that exact
catalog through `TUIMINAL_RELEASE_FEATURES_DIR`; rebuilding separately on each OS
could produce different hashes for the same release URLs. Each runner:

1. Installs the exact dependency tree for its platform without package scripts.
2. Runs the full source gate on Unix; Windows runs every static gate and the maintained portable suite. Unix also verifies the isolated workspace packages and real HTTP PTY flows.
3. Compiles only its native target.
4. Checks the exact contents of npm tarballs.
5. Installs the main and platform packages in a temporary path containing spaces
   and Unicode, with Bun absent from `PATH`.
6. Installs all five pinned payloads over loopback, exercises `--version`, `--help`,
   an HTTP request, and SQLite worker IPC through the minimal executable. Opens and
   closes each downloaded tool through native terminal input in an empty disposable
   project. Source tests also exercise the default and custom Free Terminal shell
   with real input, output, and child retirement on the native host.
7. Removes the temporary installation.

`bun run build:release [target]` writes `dist/npm/SHA256SUMS` for candidate
executables and manifests. `dist/features/<version>/catalog.json` records the five
archive hashes and their expanded files; these hashes are also embedded in the
executable. `bun run test:release [target]` checks those
hashes before smoke tests. Cross-compilation alone is not native validation;
all jobs must pass on the same SHA. The `npm-<target>` artifacts contain tar archives
that preserve executable permissions; extract them before packing or publishing.

Beyond the automated workflow, approval must record per-system results for PTYs,
process-tree shutdown, the SQLite helper, proxy/TLS, and credential storage. Any
unvalidated platform must be removed from advertised support or keep the release
blocked.

## 3. Authorized publication

Publication remains separate from the read-only candidate workflow. `Publish alpha`
(`publish-release.yml`) runs only from protected `main`, in the GitHub environment
`npm`. Its input is a successful candidate run ID for the exact current main SHA;
it also requires a successful normal quality workflow on that SHA. The candidate
must contain successful jobs for all six native targets, canonical features, and
Docker-backed MySQL/MariaDB/PostgreSQL driver integration.

Configure an npm GitHub Actions Trusted Publisher on each of the seven public
packages with owner `DeividXupon`, repository `tuiminal`, workflow
`publish-release.yml`, environment `npm`, and **Allow npm publish** enabled. Restrict
that GitHub environment to `main`. Source workspaces stay private. No npm token is
stored in the repository or candidate workflow. Never move `latest` by assumption.

The publication workflow:

1. Downloads the qualified workflow artifacts without rebuilding them. Checks exact
   archive paths, all executable/manifest hashes, versioned manifests, shared launcher
   bytes, licenses, and the five complete feature payloads. Packs seven npm tarballs.
2. Reconciles all existing npm versions. A different integrity value blocks publication;
   an identical accepted version is not dispatched again.
3. Creates a draft prerelease targeting the qualified SHA and uploads the exact five
   feature archives, catalog, seven npm tarballs, publication manifest, and SHA256SUMS.
   Verifies GitHub's asset digests before publishing the release. Existing differing
   assets are never overwritten.
4. Verifies the public feature URLs against the catalog embedded in the native binaries.
5. Publishes the six platform packages first and the launcher last with npm provenance
   and the `alpha` tag. Confirms integrity, channel, and preservation of `latest`.
6. Uses six native jobs to install from the public npm registry, compare the installed
   executable to the qualified bytes, download all five public features into temporary
   data directories, and repeat HTTP/SQLite/version/help smoke tests without Bun in PATH.

A failed or uncertain write stops the sequence. Inspect the actual npm/GitHub state
before continuing. Rerunning a publication never rewrites a version or release asset;
only identical already accepted content can be retained. Changed content requires
a new version. Keep per-platform manual acceptance and unresolved checks in
[alpha readiness](../ALPHA_READINESS_PLAN.md).

## 4. Incidents, withdrawal, and communication

Private reports follow [SECURITY.md](../SECURITY.md). If a distributed artifact is
incorrect or vulnerable, preserve evidence, block new installations through dist-tags
or deprecation as directed by the maintainer, prepare an immutable fixed version,
and publish guidance without exposing secrets. Never silently delete or rewrite
existing releases.
