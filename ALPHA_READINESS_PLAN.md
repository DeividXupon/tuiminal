# Alpha readiness

This is the operational qualification checklist, not a session log. The maintainer requested preparation and publication of `0.2.0-alpha.0` on
2026-09-15, using the npm `alpha` channel. Publication remains gated by qualification
of the exact candidate commit. Local source tests alone do not establish that all
six advertised native packages work.

Distribution procedures and requirements are in the [release process](./docs/release-process.md).
Implemented invariants belong in [AGENTS.md](./AGENTS.md), the
[Git specifications](./docs/design/git-pr-interface.md), and the [README](./README.md),
so completed plans are not duplicated here.

## Local hardening summary

The IDs preserve traceability to the original audit. “Fixed locally” does not
replace candidate revalidation or constitute certification.

| IDs | Local delivery | Remaining limitation |
| --- | --- | --- |
| A01–A02 | Conservative provenance for editable SQL and native read protection by dialect. | Repeat with native drivers. MCP servers and database routines depend on genuinely restricted credentials and permissions. |
| A03 | New SQL history persists metadata; SQL, parameters, and diagnostics remain in a bounded volatile cache. | Favorites save SQL by explicit choice; legacy cleanup and backup removal are not automatic. |
| A04–A06 | Private HTTP context, redirect consent, credential isolation, and cookies with PSL, prefix, and size constraints. | Repeat TLS/proxy/PTY checks in packages. Old history is not implicitly deleted; opt-in public bodies may contain unrecognized secrets. |
| A07–A08 | Autostart requires root/fingerprint trust; shutdown retains ownership and awaits only created processes. | Human acceptance of the modal and native testing of process trees, ports, and the launcher. |
| A09–A10 | Protected persistence, corruption/stale-write detection, and limits on acquisition, buffers, and rendering. | Validate disk exhaustion, interruption, multi-process concurrency, and memory/CPU/latency on target systems. |
| A11 | Writes revalidate target/schema/snapshot in a transaction, distinguish uncertain outcomes, and never retry automatically. | Repeat MySQL/MariaDB/PostgreSQL after these changes; nontransactional MySQL tables remain blocked. |
| A12 | Shared PR/Issue checkout inspects clone/remote/index/status, serializes operations, and revalidates before a single dispatch. | Real remote writes require a dedicated test repository and authorization. |
| A13 | Manual read-only matrix, six-target packaging, and launcher/helper smoke tests without Bun in `PATH`. | Cross-compilation does not establish native execution; acceptance of all six packages is pending. |
| A14–A15 | Reproducible license inventory, dependency audit, and local release controls. | Repeat on the candidate, obtain independent review, and verify remote governance/publishing identity. |
| A16 | Bounded `gh` transport with reconciliation and no replay; external response opening limited to validated raster images and controlled downloads. | Human acceptance across terminals/languages/OSes, demos, and any explicitly authorized remote writes. |

## Historical evidence and limitations

- [x] Fix missed notifications for newly created HTTP directories on Bun 1.3.14.
  Bounded per-directory watchers replace recursive registration; serialized rename
  reconciliation discovers files created before attachment. The native regression
  creates, edits, and removes nested files without a registration sleep.
- [x] Fix the continuous HTTP response lifecycle. A real loopback reproduction showed
  that cancelling Bun's response reader alone did not stop incoming bytes. Each
  request now retires its owned AbortController after capture/failure. Regression
  coverage verifies exact truncation, socket closure, an unaffected caller signal,
  and TUI keyboard responsiveness. Fixture producers honor backpressure and socket
  closure rather than relying on Bun's missing ServerResponse.close event.

In the local 2026-09-10 round, `bun run check`, opt-in HTTP PTY tests in compact/framed
layouts, dependency auditing, cross-builds, and Linux x64 distribution smoke tests
passed. These results do not replace a run on the candidate SHA: test counts and
dependency results age and must be recorded again for each qualification.

That round could not repeat the Docker matrix, regenerate demos without ImageMagick,
or exercise the other five native runtimes. GitHub protections/permissions and npm
publication were not validated in that round; unavailable infrastructure does not
count as a pass.

The 2026-09-15 candidate `d9d31ccb4af00ec84e46afe197fc192217e2e22d`
passed the [six native packages and database driver matrix](https://github.com/DeividXupon/tuiminal/actions/runs/34994676488)
and [normal quality gate](https://github.com/DeividXupon/tuiminal/actions/runs/34994676492).
Downloading those actual artifacts and staging publication locally validated all
seven npm tarballs and five feature payloads, including hashes, shared launcher
bytes, versions, and licenses. No alpha version was published by those checks.
The installer and five tool demos were regenerated and reviewed for this change.

Subsequent package UI qualification found a native-shell assumption in Free Terminal:
without `SHELL`, Windows also selected `/bin/zsh`. The correction uses the Windows
command interpreter with AutoRun disabled, retains configured POSIX shells with a
portable `/bin/sh` fallback, and adds native process coverage. Requalify the final
SHA after this correction; the earlier green run does not cover it. Human terminal,
credential-store, TLS/proxy, and independent artifact review remain separate from
the automated checks.

Native UI qualification exposed a runtime blocker on Windows ARM64: Bun 1.3.14
disables TinyCC/FFI there, so OpenTUI initialization fails even though HTTP/SQLite
headless smoke checks pass. See the [native job](https://github.com/DeividXupon/tuiminal/actions/runs/34997480889/job/104477352508)
and [upstream limitation](https://github.com/oven-sh/bun/issues/28055). The maintainer
chose to retain this platform by investigating a runtime upgrade. Bun 1.4.2 includes
the [upstream FFI correction](https://github.com/oven-sh/bun/pull/33696); the repository
now pins it while keeping the existing dependency lockfile and host UI versions.
Local OpenTUI initialization and the GitHub mutation/terminal regressions pass on
that runtime. Native qualification on all six targets is still required; an upstream
fix alone does not establish that the packaged Windows ARM64 interface works.
The first Bun 1.4.2 native run opened Database and Git on Windows ARM64, then exposed
an existing Runner startup failure on both Windows architectures: atomic session
storage called `fsync` on a read-only directory handle and threw `EPERM`. File data
is still flushed before rename on every platform; only the POSIX directory flush
is platform-specific. Native file/backup/conflict tests and an empty Runner rendering
check now guard that path. Requalify all five installed tools after this correction.

## Alpha approval blockers

Every result must refer to the **same immutable candidate SHA**:

- [ ] Agree on the candidate with the maintainer. Create a commit only when requested;
  run `bun run check`, `git diff --check`, and the normal workflow on that SHA.
- [ ] Run `Release candidate matrix` on all six native runners, checking packages,
  hashes, launcher, and SQLite helper without Bun in `PATH`.
- [ ] Repeat `bun run test:database:drivers` and SQLite, MySQL, MariaDB, and PostgreSQL
  cases after write/read-only changes.
- [ ] Validate native packages for PTYs, shutdown/process trees, helper, TLS/proxy,
  keychain, terminal, mouse, clipboard, Unicode, and upgrade/uninstall.
- [ ] Regenerate the installation and all five tool demos with `bun run docs:demos`
  and ImageMagick; review them.
- [ ] Repeat dependency/license auditing and independently review the final artifact;
  the inventory does not replace this review.
- [ ] Verify branch protections, bypasses, collaborators, and GitHub/npm publishing
  identity, including Trusted Publishing.
- [ ] Obtain explicit approval of the version, SHA, tag, notes, and dist-tag.

A rejected candidate or uncertain result must not publish or automatically repeat
a write. None of the items above independently authorizes remote changes.

## Retained investigation topics

The 2026-09-12 code review recorded these hypotheses, **not failures reproduced in
the final gate**. Inspect the implementation and reproduce a problem before proposing
a fix; this list does not imply that all risks have already been resolved.

- Git: late console/diff/stage responses on project changes, configuration races,
  guided-terminal lifecycle, and Boolean-query/account-scope/identity precedence.
- Runner: validation of restored data.
- HTTP: concurrent saves, stale import previews, modal focus, and JSON rendering limits.
- Translations: data treated as UI text, Portuguese error codes, pattern cost for
  deeply nested unknown warnings, and old entries whose lack of consumers is unverified.
- Scripts: old demo shortcuts, smoke-test isolation, and waiting for process cleanup.
- Tests: Inbox preference restoration; cleanup after assertion, connection, or server
  failures; and fixed waits sensitive to machine load.

For each qualification, record the SHA, platform, executed commands, skips, results,
and unresolved risks. Do not turn a local review or a green gate into a claim that
vulnerabilities are absent.
