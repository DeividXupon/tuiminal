# Release process

Tuiminal is still in pre-alpha. Building a candidate does not authorize publication.
Publishing requires an immutable commit approved by the maintainer, a green gate on
that exact SHA, and native validation of all six advertised platform packages.

## 1. Prepare the candidate

1. Agree on the version and npm channel with the maintainer; never move `latest`
   by assumption. Update the root version, `apps/cli`, and every package in `packages`,
   including exact internal peer versions. Workspace checks and builds reject drift.
2. Install with Bun 1.3.14 and confirm that the lockfile remains unchanged:

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
4. Regenerate all five demos with `bun run docs:demos` after material layout or
   workflow changes, and visually review the GIFs.
5. Manually trigger `Release candidate matrix`. This workflow has only `contents: read`,
   receives no npm credential, and contains no publishing step. A build, test, or
   packaging failure therefore stops the job without publishing.

## 2. Matrix and artifacts

The workflow uses native runners for `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64`, `win32-x64`, and `win32-arm64`. Each runner:

1. Installs the exact dependency tree for its platform without package scripts.
2. Runs the full source gate.
3. Compiles only its native target.
4. Checks the exact contents of npm tarballs.
5. Installs the main and platform packages in a temporary path containing spaces
   and Unicode, with Bun absent from `PATH`.
6. Exercises `--version`, `--help`, and an HTTP request over loopback.
7. Removes the temporary installation.

`bun run build:release [target]` writes `dist/npm/SHA256SUMS` for candidate
executables, helpers, and manifests. `bun run test:release [target]` checks those
hashes before smoke tests. Cross-compilation alone is not native validation;
all jobs must pass on the same SHA.

Beyond the automated workflow, approval must record per-system results for PTYs,
process-tree shutdown, the SQLite helper, proxy/TLS, and credential storage. Any
unvalidated platform must be removed from advertised support or keep the release
blocked.

## 3. Authorized publication

Initial publication deliberately remains outside the candidate workflow. Before
adding or running it:

- Verify effective remote `main` protection, required checks, bypasses, and collaborators.
- Obtain explicit maintainer approval for the version, SHA, tag, notes, and channel.
- Configure npm Trusted Publishing for the exact workflow/repository, with minimal
  permissions and no stored long-lived personal token.
- Confirm that names, versions, LICENSE, notices, `SHA256SUMS`, and tag identify
  the same content.
- Publish the six platform packages first and the launcher last, without overwriting
  an existing version.
- Install again from the registry in a clean environment and repeat the smoke tests.

A failure or uncertain result stops the sequence. Never automatically repeat a
publication the registry may already have accepted. Reconcile npm and GitHub state
before taking another action.

## 4. Incidents, withdrawal, and communication

Private reports follow [SECURITY.md](../SECURITY.md). If a distributed artifact is
incorrect or vulnerable, preserve evidence, block new installations through dist-tags
or deprecation as directed by the maintainer, prepare an immutable fixed version,
and publish guidance without exposing secrets. Never silently delete or rewrite
existing releases.
