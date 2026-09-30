import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RemoteCodexTarget } from "../packages/feature-terminal/src/model/sessions"
import {
  createRemoteLiveDiffSource,
  localRemoteLiveDiffHelperCommand,
  remoteLiveDiffSshCommand,
} from "../packages/feature-terminal/src/services/remote-live-diff"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixtureRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tuiminal-remote-live-diff-")))
  roots.push(root)
  return root
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" })
}

function remote(root: string): RemoteCodexTarget {
  return {
    profile: {
      id: "fixture",
      name: "fixture-vps",
      host: "fixture-vps",
    },
    workingDirectory: root,
  }
}

test("remote Live Diff keeps one helper channel for root, snapshot, worktrees, and patches", async () => {
  const root = fixtureRoot()
  git(root, "init", "-q")
  git(root, "config", "user.email", "fixture@example.com")
  git(root, "config", "user.name", "Fixture")
  writeFileSync(join(root, "tracked file.ts"), "const value = 1\n")
  git(root, "add", "tracked file.ts")
  git(root, "commit", "-qm", "initial")
  const linkedWorktree = `${root}-linked`
  roots.push(linkedWorktree)
  git(root, "worktree", "add", "-q", "-b", "linked", linkedWorktree)
  writeFileSync(join(root, "tracked file.ts"), "const value = 2\n")
  writeFileSync(join(root, "new file.ts"), "first\nsecond\n")
  writeFileSync(join(root, "odd '$ file.ts"), "safe\n")

  const target = remote(root)
  const starts = join(root, "helper-starts")
  const helper = localRemoteLiveDiffHelperCommand(root)
  const source = createRemoteLiveDiffSource(target, {
    command: [
      "sh",
      "-c",
      'printf x >> "$1"; shift; exec "$@"',
      "tuiminal-live-diff-counter",
      starts,
      ...helper,
    ],
  })
  const signal = new AbortController().signal
  try {
    expect(await source.repositoryRoot(root, signal)).toBe(root)
    expect(await source.worktrees(root, signal)).toEqual([root, linkedWorktree])
    const snapshot = await source.readRoot(root, signal)
    expect(snapshot.truncated).toBe(false)
    const tracked = snapshot.files.find((file) => file.path === "tracked file.ts")
    const untracked = snapshot.files.find((file) => file.path === "new file.ts")
    const odd = snapshot.files.find((file) => file.path === "odd '$ file.ts")
    if (!tracked || !untracked || !odd) throw new Error("Remote snapshot omitted fixture files")
    expect(tracked).toMatchObject({ change: "Edit", additions: 1, deletions: 1 })
    expect(untracked).toMatchObject({ change: "New", additions: 2, deletions: 0 })
    expect(odd).toMatchObject({ change: "New", additions: 1, deletions: 0 })
    expect(await source.readPatch({ ...tracked, changedAt: Date.now() }, signal)).toContain(
      "+const value = 2",
    )
    expect(await source.readPatch({ ...untracked, changedAt: Date.now() }, signal)).toContain(
      "+second",
    )
    expect(await source.readPatch({ ...odd, changedAt: Date.now() }, signal)).toContain("+safe")
    expect(readFileSync(starts, "utf8")).toBe("x")
  } finally {
    source.close()
  }
  await expect(source.repositoryRoot(root, signal)).rejects.toThrow("fechado")
})

test("remote Live Diff reconnects its owned helper after a transport exit", async () => {
  const root = fixtureRoot()
  git(root, "init", "-q")
  const starts = join(root, "helper-starts")
  const helper = localRemoteLiveDiffHelperCommand(root)
  const source = createRemoteLiveDiffSource(remote(root), {
    command: [
      "sh",
      "-c",
      'printf x >> "$1"; count=$(wc -c < "$1"); shift; if [ "$count" -eq 1 ]; then exit 91; fi; exec "$@"',
      "tuiminal-live-diff-reconnect",
      starts,
      ...helper,
    ],
  })
  const signal = new AbortController().signal
  try {
    await expect(source.repositoryRoot(root, signal)).rejects.toThrow()
    expect(await source.repositoryRoot(root, signal)).toBe(root)
    expect(readFileSync(starts, "utf8")).toBe("xx")
  } finally {
    source.close()
  }
})

test("remote Live Diff SSH command uses the selected profile and keeps the directory as data", () => {
  const target = remote("/srv/project with 'quote'")
  const command = remoteLiveDiffSshCommand(target.profile, target.workingDirectory)

  expect(command.slice(0, -1)).toEqual([
    "ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "fixture-vps",
  ])
  expect(command.at(-1)).toContain("tuiminal-live-diff '/srv/project with '")
  expect(command.at(-1)).not.toContain("git -C '/srv/project with")
})
