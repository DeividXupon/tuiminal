import { afterEach, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  pullRequestCheckTransitionShouldNotify,
  summarizePullRequestChecks,
} from "../src/features/git/model/pr/checks"
import { pullRequestMarkdownLines, sanitizeGitHubText } from "../src/features/git/model/pr/content"
import {
  adjacentPullRequestHunkOffset,
  boundedPullRequestDiff,
  pullRequestDiffHunkOffsets,
  pullRequestDiffKeyboardAction,
} from "../src/features/git/model/pr/diff"
import { DEMO_PULL_REQUESTS } from "../src/features/git/model/pr/fixtures"
import type { PullRequestCheck } from "../src/features/git/model/pr/types"
import { resolveDiffDocumentPath } from "../src/features/git/model/view"
import { parseDiffDocuments } from "../src/features/git/rendering/diff"
import { loadPullRequestDiff } from "../src/features/git/services/github/diff"
import { openWorkflowRunInBrowser } from "../src/features/git/services/github/read-actions"
import { loadPullRequestWorkflowRuns } from "../src/features/git/services/github/workflows"
import {
  type CheckoutGitProbeResult,
  inspectCheckoutClone,
  parseGitHubRemote,
  withValidatedCheckoutClone,
} from "../src/features/git/services/pr-checkout"
import { PullRequestWatchScheduler } from "../src/features/git/services/pr-watch"
import { pullRequestNotificationCommand } from "../src/features/git/services/pr-notifications"

const roots: string[] = []
const item = (() => {
  const candidate = DEMO_PULL_REQUESTS[0]
  if (!candidate) throw new Error("missing pull request fixture")
  return candidate
})()
const check = (state: PullRequestCheck["state"]): PullRequestCheck => ({
  id: "ci-1",
  name: "test",
  state,
  detailsUrl: "https://github.com/equipe/api/actions/runs/1",
  provider: "GitHub Actions",
})

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
}

function fixtureRepository() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-checkout-"))
  roots.push(root)
  git(root, "init", "-q")
  git(root, "config", "user.name", "Fixture")
  git(root, "config", "user.email", "fixture@example.test")
  git(root, "remote", "add", "origin", "git@github.com:equipe/api.git")
  writeFileSync(join(root, "README.md"), "fixture\n")
  git(root, "add", "README.md")
  git(root, "commit", "-qm", "fixture")
  return root
}

function nativeGitProbe(
  fail: (args: readonly string[]) => CheckoutGitProbeResult | null = () => null,
) {
  return async (cwd: string, args: readonly string[]): Promise<CheckoutGitProbeResult> => {
    const failed = fail(args)
    if (failed) return failed
    try {
      return {
        ok: true,
        stdout: execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      }
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string }
      return {
        ok: false,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        exitCode: failure.status ?? null,
        timedOut: false,
      }
    }
  }
}

function fakeGitHubExecutable() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-gh-runtime-"))
  roots.push(root)
  const executable = join(root, "gh")
  const log = join(root, "log.json")
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { writeFileSync } from "node:fs"
const args = process.argv.slice(2)
writeFileSync(process.env.FAKE_LOG, JSON.stringify(args))
if (args[0] === "pr" && args[1] === "diff") {
  console.log("diff --git a/src/a.ts b/src/a.ts\\n--- a/src/a.ts\\n+++ b/src/a.ts\\n@@ -1 +1 @@\\n-old\\n+new")
} else {
  console.log(JSON.stringify({ workflow_runs: [
    { id: 11, name: "fork-ci", status: "action_required", conclusion: null, head_sha: "${item.headSha}", run_attempt: 2, event: "pull_request", html_url: "https://github.com/equipe/api/actions/runs/11", actor: { login: "contributor" }, head_repository: { name: "api", owner: { login: "fork-owner" } }, repository: { name: "api", owner: { login: "equipe" } } },
    { id: 12, name: "deploy", status: "waiting", conclusion: null, head_sha: "${item.headSha}", event: "pull_request", html_url: "https://github.com/equipe/api/actions/runs/12", actor: { login: "deivid" }, head_repository: { name: "api", owner: { login: "equipe" } }, repository: { name: "api", owner: { login: "equipe" } } }
  ] }))
}
`,
  )
  chmodSync(executable, 0o755)
  return { executable, log }
}

describe("remote pull request diff", () => {
  test("renders remote Markdown as inert terminal text", () => {
    const lines = pullRequestMarkdownLines(
      "# Título\n- **seguro**\n> [manual](https://example.test/help)\n![pixel](https://tracker.test/p.png)\n<script>alert(1)</script>\n[ruim](javascript:bad)",
    )
    expect(lines).toEqual([
      { kind: "heading", content: "◆ Título" },
      { kind: "bullet", content: "• seguro" },
      { kind: "quote", content: "│ manual · https://example.test/help" },
      { kind: "text", content: "imagem: pixel" },
      { kind: "text", content: "alert(1)" },
      { kind: "text", content: "ruim" },
    ])
    expect(sanitizeGitHubText("ok\u001b]52;clipboard\u0007\u009b31m")).toBe("ok]52;clipboard31m")
  })

  test("sanitizes controls, normalizes line endings and bounds bytes", () => {
    expect(boundedPullRequestDiff("one\r\ntwo\u001b]52;bad", 8)).toEqual({
      source: "one\ntwo]",
      byteLength: 14,
      truncated: true,
    })
  })

  test("maps file/document focus and Vim navigation", () => {
    expect(pullRequestDiffKeyboardAction("h")).toEqual({ type: "focus", target: "files" })
    expect(pullRequestDiffKeyboardAction("l")).toEqual({ type: "focus", target: "document" })
    expect(pullRequestDiffKeyboardAction("j")).toEqual({ type: "move", delta: 1 })
    expect(pullRequestDiffKeyboardAction("v")).toEqual({ type: "cycle-mode" })
    expect(pullRequestDiffKeyboardAction("]")).toEqual({ type: "move-hunk", delta: 1 })
    expect(pullRequestDiffKeyboardAction("escape")).toEqual({ type: "close" })
  })

  test("parses quoted paths, special files and navigates hunks by rendered offsets", () => {
    const source = [
      'diff --git "a/src/tab\\tname.ts" "b/src/tab\\tname.ts"',
      '--- "a/src/tab\\tname.ts"',
      '+++ "b/src/tab\\tname.ts"',
      "@@ -1,2 +1,2 @@",
      "-old",
      "+new",
      " same",
      "@@ -8 +8 @@",
      "-before",
      "+after",
    ].join("\n")
    expect(resolveDiffDocumentPath(source.split("\n")[0] ?? "")).toBe("src/tab\tname.ts")
    expect(parseDiffDocuments(source)[0]?.path).toBe("src/tab\tname.ts")
    expect(pullRequestDiffHunkOffsets(source, "unified")).toEqual([0, 3])
    expect(pullRequestDiffHunkOffsets(source, "split")).toEqual([0, 2])
    expect(adjacentPullRequestHunkOffset(0, [0, 3], 1)).toBe(3)
    expect(adjacentPullRequestHunkOffset(3, [0, 3], -1)).toBe(0)
  })

  test("requests a PR diff with an explicit repository and immutable SHAs", async () => {
    const fake = fakeGitHubExecutable()
    const snapshot = await loadPullRequestDiff({
      identity: item.identity,
      target: { kind: "pr" },
      baseSha: "base-sha",
      headSha: item.headSha,
      options: { executable: fake.executable, env: { FAKE_LOG: fake.log } },
    })
    expect(JSON.parse(readFileSync(fake.log, "utf8"))).toEqual([
      "pr",
      "diff",
      "142",
      "--repo",
      "equipe/api",
      "--color",
      "never",
    ])
    expect(snapshot).toMatchObject({ baseSha: "base-sha", headSha: item.headSha, truncated: false })
    expect(snapshot.source).toContain("+new")
  })

  test("opens an exact workflow run without interpolating a URL or shell command", async () => {
    const fake = fakeGitHubExecutable()
    await openWorkflowRunInBrowser(item.identity, 12, {
      executable: fake.executable,
      env: { FAKE_LOG: fake.log },
    })
    expect(JSON.parse(readFileSync(fake.log, "utf8"))).toEqual([
      "run",
      "view",
      "12",
      "--repo",
      "equipe/api",
      "--web",
    ])
    expect(() => openWorkflowRunInBrowser(item.identity, 0)).toThrow("Invalid workflow run id")
  })
})

describe("checkout safeguards", () => {
  test("parses SSH/HTTPS remotes without invoking a shell", () => {
    expect(parseGitHubRemote("git@github.com:equipe/api.git")).toEqual({
      host: "github.com",
      repository: "equipe/api",
    })
    expect(parseGitHubRemote("https://github.com/equipe/api.git")).toEqual({
      host: "github.com",
      repository: "equipe/api",
    })
    expect(parseGitHubRemote("file:///tmp/api")).toBeNull()
  })

  test("allows only the clean matching clone", async () => {
    const root = fixtureRepository()
    expect(await inspectCheckoutClone(root, item.identity)).toMatchObject({
      eligible: true,
      reason: null,
      root: realpathSync(root),
    })
    writeFileSync(join(root, "untracked.txt"), "local work")
    expect(await inspectCheckoutClone(root, item.identity)).toMatchObject({
      eligible: false,
      reason: "worktree-dirty",
    })
  })

  test("revalidates changes made after confirmation before dispatch", async () => {
    const root = fixtureRepository()
    expect(await inspectCheckoutClone(root, item.identity)).toMatchObject({ eligible: true })
    writeFileSync(join(root, "changed-after-confirmation.txt"), "local work")
    let dispatched = false
    expect(
      await withValidatedCheckoutClone(root, item.identity, async () => {
        dispatched = true
      }),
    ).toEqual({ status: "rejected", reason: "worktree-dirty" })
    expect(dispatched).toBe(false)
  })

  test("blocks wrong remotes and Git operations in progress", async () => {
    const wrong = fixtureRepository()
    git(wrong, "remote", "set-url", "origin", "https://github.com/other/repo.git")
    expect(await inspectCheckoutClone(wrong, item.identity)).toMatchObject({
      eligible: false,
      reason: "remote-mismatch",
    })
    const busy = fixtureRepository()
    const gitDirectory = git(busy, "rev-parse", "--git-dir")
    mkdirSync(join(busy, gitDirectory, "rebase-apply"))
    expect(await inspectCheckoutClone(busy, item.identity)).toMatchObject({
      eligible: false,
      reason: "git-operation-in-progress",
    })
  })

  test("recognizes a clean linked Git worktree as the selected clone", async () => {
    const root = fixtureRepository()
    const worktreeContainer = mkdtempSync(join(tmpdir(), "tuiminal-linked-worktree-"))
    roots.push(worktreeContainer)
    const worktree = join(worktreeContainer, "feature")
    git(root, "worktree", "add", "-qb", "fixture/feature", worktree)
    expect(await inspectCheckoutClone(worktree, item.identity)).toMatchObject({
      eligible: true,
      reason: null,
      root: realpathSync(worktree),
      branch: "fixture/feature",
    })
  })

  test("fails closed when status, index, or Git metadata cannot be validated", async () => {
    const statusRoot = fixtureRepository()
    const unavailable = {
      ok: false,
      stdout: "",
      stderr: "permission denied",
      exitCode: 128,
      timedOut: false,
    }
    expect(
      await inspectCheckoutClone(statusRoot, item.identity, {
        runGit: nativeGitProbe((args) => (args[0] === "status" ? unavailable : null)),
      }),
    ).toMatchObject({ eligible: false, reason: "worktree-status-unavailable" })
    expect(
      await inspectCheckoutClone(statusRoot, item.identity, {
        runGit: nativeGitProbe((args) =>
          args[0] === "rev-parse" && args[1] === "--git-dir" ? unavailable : null,
        ),
      }),
    ).toMatchObject({ eligible: false, reason: "git-metadata-unavailable" })

    const corruptIndexRoot = fixtureRepository()
    rmSync(join(corruptIndexRoot, ".git", "index"))
    mkdirSync(join(corruptIndexRoot, ".git", "index"))
    expect(await inspectCheckoutClone(corruptIndexRoot, item.identity)).toMatchObject({
      eligible: false,
      reason: "worktree-status-unavailable",
    })
  })

  test("fails closed on a timed-out probe and serializes checkout by canonical clone", async () => {
    const root = fixtureRepository()
    expect(
      await inspectCheckoutClone(root, item.identity, {
        runGit: nativeGitProbe((args) =>
          args[0] === "status"
            ? { ok: false, stdout: "", stderr: "", exitCode: null, timedOut: true }
            : null,
        ),
      }),
    ).toMatchObject({ eligible: false, reason: "worktree-status-unavailable" })

    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const didStart = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = withValidatedCheckoutClone(root, item.identity, async () => {
      started?.()
      await gate
      return "done"
    })
    await didStart
    expect(await withValidatedCheckoutClone(root, item.identity, async () => "unexpected")).toEqual(
      { status: "rejected", reason: "checkout-clone-in-progress" },
    )
    release?.()
    await expect(first).resolves.toMatchObject({ status: "executed", value: "done" })
  })
})

describe("CI summaries and watch lifecycle", () => {
  test("distinguishes no checks, pending and terminal failures", () => {
    const none = summarizePullRequestChecks([])
    const pending = summarizePullRequestChecks([check("pending")])
    const failed = summarizePullRequestChecks([check("failure"), check("skipped")])
    expect(none).toMatchObject({ state: "none", terminal: false })
    expect(pending).toMatchObject({ state: "pending", terminal: false })
    expect(failed).toMatchObject({ state: "failure", terminal: true, failure: 1, skipped: 1 })
    expect(pullRequestCheckTransitionShouldNotify(null, failed)).toBe(false)
    expect(pullRequestCheckTransitionShouldNotify(pending, failed)).toBe(true)
  })

  test("notifies once after an observed transition and then stops", async () => {
    let reads = 0
    let notices = 0
    const scheduler = new PullRequestWatchScheduler(
      async () => [check(reads++ === 0 ? "pending" : "success")],
      () => {
        notices += 1
      },
      { intervalMs: 2, random: () => 0.5 },
    )
    expect(scheduler.watch(item)).toBe(true)
    await Bun.sleep(30)
    expect(notices).toBe(1)
    expect(scheduler.isWatching(item)).toBe(false)
    scheduler.dispose()
  })

  test("does not announce an already terminal initial snapshot", async () => {
    let notices = 0
    const scheduler = new PullRequestWatchScheduler(
      async () => [check("success")],
      () => {
        notices += 1
      },
      { intervalMs: 2 },
    )
    scheduler.watch(item)
    await Bun.sleep(10)
    expect(notices).toBe(0)
    expect(scheduler.isWatching(item)).toBe(false)
    scheduler.dispose()
  })

  test("distinguishes an approvable fork run from deployment protection", async () => {
    const fake = fakeGitHubExecutable()
    const runs = await loadPullRequestWorkflowRuns({
      identity: item.identity,
      headSha: item.headSha,
      options: { executable: fake.executable, env: { FAKE_LOG: fake.log } },
    })
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({
      id: 11,
      attempt: 2,
      headRepository: "fork-owner/api",
      eligibleForApproval: true,
      deploymentProtection: false,
    })
    expect(runs[1]).toMatchObject({
      id: 12,
      eligibleForApproval: false,
      deploymentProtection: true,
    })
  })

  test("tracks check attempts, caps watches and backs off after reader failures", async () => {
    expect(summarizePullRequestChecks([{ ...check("pending"), attempt: 2 }]).signature).toContain(
      ":2:pending",
    )
    const pending = new Promise<readonly PullRequestCheck[]>(() => undefined)
    const capped = new PullRequestWatchScheduler(
      () => pending,
      () => undefined,
    )
    for (let number = 0; number < 10; number += 1) {
      expect(capped.watch({ ...item, headSha: `head-${number}` })).toBe(true)
    }
    expect(capped.watch({ ...item, headSha: "head-11" })).toBe(false)
    capped.dispose()

    const delays: number[] = []
    const scheduler = new PullRequestWatchScheduler(
      async () => {
        throw new Error("temporary")
      },
      () => undefined,
      {
        intervalMs: 100,
        random: () => 0.5,
        setTimer: ((_callback: () => void, delay = 0) => {
          delays.push(delay)
          return 1 as unknown as ReturnType<typeof setTimeout>
        }) as typeof setTimeout,
        clearTimer: (() => undefined) as typeof clearTimeout,
      },
    )
    scheduler.watch(item)
    await Bun.sleep(5)
    expect(delays).toEqual([200])
    scheduler.dispose()
  })

  test("builds desktop notifications as argument arrays and honors discreet mode", () => {
    const title = 'repo #1 "$(touch nope)"'
    const visible = pullRequestNotificationCommand({
      title,
      message: "CI failed",
      discreet: false,
      platform: "linux",
    })
    expect(visible).toEqual({
      executable: "notify-send",
      args: ["--app-name", "Tuiminal", title, "CI failed"],
    })
    expect(
      pullRequestNotificationCommand({
        title,
        message: "CI failed",
        discreet: true,
        platform: "darwin",
      })?.args,
    ).not.toContain(title)
  })
})
