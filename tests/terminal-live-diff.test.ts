import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { displayWidth } from "../packages/core/src/i18n/index"
import {
  liveDiffTotals,
  mergeLiveDiffFiles,
  parseLiveDiffNumstat,
  parseLiveDiffStatus,
} from "../packages/feature-terminal/src/model/live-diff"
import {
  changedHunkLineIndex,
  latestChangedHunkIndex,
} from "../packages/feature-terminal/src/rendering/live-diff-hunks"
import {
  abbreviatedFolder,
  fittedLiveDiffPath,
  liveDiffDisplayPath,
  liveDiffFileStatus,
  liveDiffPathWidth,
  liveDiffWrappedHeight,
} from "../packages/feature-terminal/src/rendering/live-diff-table"
import {
  liveDiffRepositoryRoot,
  liveDiffWorktrees,
  readLiveDiffPatch,
  readLiveDiffRoot,
} from "../packages/feature-terminal/src/services/live-diff"

const temporary: string[] = []
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" })
}

function write(root: string, path: string, content: string | Buffer) {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, content)
}

function repository(committed = true) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-live-diff-"))
  temporary.push(root)
  git(root, "init", "--quiet")
  git(root, "config", "user.name", "Live diff fixture")
  git(root, "config", "user.email", "live-diff@example.invalid")
  git(root, "config", "commit.gpgSign", "false")
  git(root, "config", "core.hooksPath", join(root, "no-hooks"))
  if (committed) {
    write(root, "packages/terminal.ts", "one\nold\n")
    git(root, "add", "--all")
    git(root, "commit", "--quiet", "-m", "fixture")
  }
  return root
}

test("parses NUL-delimited Git paths without losing spaces or tabs", () => {
  expect(parseLiveDiffStatus(" M packages/a b.ts\0?? tabs\there.txt\0")).toEqual([
    { status: " M", path: "packages/a b.ts" },
    { status: "??", path: "tabs\there.txt" },
  ])
  expect(parseLiveDiffNumstat("2\t1\tpackages/a b.ts\0-\t-\tasset.bin\0")).toEqual(
    new Map([
      ["packages/a b.ts", { additions: 2, deletions: 1 }],
      ["asset.bin", { additions: null, deletions: null }],
    ]),
  )
})

test("Live Diff rows shorten only ancestor folders and reserve aligned columns", () => {
  expect(abbreviatedFolder("tuiminal-free-terminal-session-folds")).toBe("tuimi..folds")
  expect(abbreviatedFolder("model")).toBe("model")
  expect(displayWidth(abbreviatedFolder("日本語のとても長いフォルダー名"))).toBeLessThanOrEqual(12)
  expect(
    liveDiffDisplayPath(
      "/workspace/tuiminal-free-terminal-session-folds",
      "packages/feature-terminal/src/model/sessions.ts",
    ),
  ).toBe("tuimi..folds/--/model/sessions.ts")
  expect(liveDiffDisplayPath("/workspace/app", "src/a.ts")).toBe("app/--/src/a.ts")
  expect(fittedLiveDiffPath("/workspace/a-very-long-project", "src/model/sessions.ts", 18)).toBe(
    "…model/sessions.ts",
  )
  expect(liveDiffPathWidth(60)).toBe(35)
  expect(liveDiffWrappedHeight("@@ -1 +1 @@\n+abcdefghijklmnopqrstuvwx\n", 20)).toBe(5)
})

test("Live Diff orders changed files newest first and preserves timestamps for unchanged files", () => {
  const root = "/fixture/project"
  const file = (path: string, fingerprint: string) => ({
    root,
    path,
    fingerprint,
    additions: 1,
    deletions: 0,
    untracked: false,
    newFile: false,
    headExists: true,
  })
  const first = mergeLiveDiffFiles([], [file("a.ts", "a1"), file("b.ts", "b1")], 1000)
  expect(first.map(({ path }) => path)).toEqual(["a.ts", "b.ts"])
  const next = mergeLiveDiffFiles(first, [file("a.ts", "a1"), file("b.ts", "b2")], 2000)
  expect(next.map(({ path, changedAt }) => [path, changedAt])).toEqual([
    ["b.ts", 2000],
    ["a.ts", 1000],
  ])
  expect(
    mergeLiveDiffFiles(next, [file("a.ts", "a3"), file("b.ts", "b2")], 3000).map(
      ({ path }) => path,
    ),
  ).toEqual(["a.ts", "b.ts"])
})

test("automatic Live Diff follows the newly changed hunk in the complete patch", () => {
  const first = `diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1,3 +1,3 @@\n before\n-old first\n+new first\n after\n@@ -30,3 +30,3 @@\n before\n-old second\n+new second\n after\n`
  const changedFirst = first.replace("+new first", "+newer first")
  const shiftedSecond = first.replace("@@ -30,3 +30,3 @@", "@@ -32,3 +32,3 @@")
  expect(latestChangedHunkIndex(null, first)).toBe(1)
  expect(latestChangedHunkIndex(first, changedFirst)).toBe(0)
  expect(latestChangedHunkIndex(first, shiftedSecond)).toBeNull()
  expect(latestChangedHunkIndex(first, first)).toBeNull()
  expect(latestChangedHunkIndex(first, first.replace("+new second", "+newer second"))).toBe(1)
  expect(changedHunkLineIndex(first, 0)).toBe(1)
  expect(changedHunkLineIndex(first, 1)).toBe(5)
  expect(changedHunkLineIndex(changedFirst, 0, first)).toBe(2)
})

test("reads staged plus unstaged as one final diff and counts untracked files", async () => {
  const root = repository()
  const signal = new AbortController().signal
  write(root, "packages/terminal.ts", "one\nchanged\n")
  git(root, "add", "packages/terminal.ts")
  write(root, "packages/terminal.ts", "one\nchanged\nmore\n")
  write(root, "other project/new file.ts", "new\nfile\n")
  const files = mergeLiveDiffFiles([], (await readLiveDiffRoot(root, signal)).files, 1000)
  expect(files.map((file) => file.path)).toEqual([
    "packages/terminal.ts",
    "other project/new file.ts",
  ])
  const tracked = files.find((file) => file.path === "packages/terminal.ts")!
  expect(tracked).toMatchObject({ additions: 2, deletions: 1, changedAt: 1000, newFile: false })
  expect(liveDiffFileStatus(tracked)).toBe("Edit")
  const added = files.find((file) => file.path === "other project/new file.ts")!
  expect(added.newFile).toBe(true)
  expect(liveDiffFileStatus(added)).toBe("New")
  expect(liveDiffTotals(files)).toEqual({ files: 2, additions: 4, deletions: 1, unknown: 0 })
  const completePatch = await readLiveDiffPatch(tracked, signal)
  expect(completePatch).toContain("+more")
  expect(completePatch).toContain("\n one\n")
  expect(await readLiveDiffPatch(files[1]!, signal)).toContain("+file")
  expect(
    mergeLiveDiffFiles(files, (await readLiveDiffRoot(root, signal)).files, 2000)[0]?.changedAt,
  ).toBe(1000)
  write(root, "packages/terminal.ts", "one\nnewer\nmore\n")
  expect(
    mergeLiveDiffFiles(files, (await readLiveDiffRoot(root, signal)).files, 3000)[0]?.changedAt,
  ).toBe(3000)
})

test("staged additions are marked New even though Git tracks them", async () => {
  const root = repository()
  write(root, "src/created.ts", "export const created = true\n")
  git(root, "add", "src/created.ts")
  const files = (await readLiveDiffRoot(root, new AbortController().signal)).files
  expect(files.find((file) => file.path === "src/created.ts")).toMatchObject({
    untracked: false,
    newFile: true,
  })
})

test("handles unborn repositories and binary files without false line counts", async () => {
  const root = repository(false)
  write(root, "new.txt", "first\nsecond\n")
  write(root, "binary.bin", Buffer.from([0, 1, 2]))
  git(root, "add", "new.txt")
  const files = mergeLiveDiffFiles(
    [],
    (await readLiveDiffRoot(root, new AbortController().signal)).files,
    0,
  )
  expect(files.find((file) => file.path === "new.txt")).toMatchObject({
    additions: 2,
    deletions: 0,
    headExists: false,
  })
  const binary = files.find((file) => file.path === "binary.bin")!
  expect(binary).toMatchObject({ additions: null, deletions: null })
  expect(await readLiveDiffPatch(binary, new AbortController().signal)).toBe("")
  expect(
    await readLiveDiffPatch(
      files.find((file) => file.path === "new.txt")!,
      new AbortController().signal,
    ),
  ).toContain("@@ -0,0 +1,2 @@")
})

test("discovers related worktrees and their independent repository roots", async () => {
  const root = repository()
  const linked = mkdtempSync(join(tmpdir(), "tuiminal-live-worktree-parent-"))
  temporary.push(linked)
  const worktree = join(linked, "feature")
  git(root, "worktree", "add", "--quiet", "-b", "feature", worktree)
  const signal = new AbortController().signal
  expect(await liveDiffRepositoryRoot(join(worktree, "packages"), signal)).toBe(
    realpathSync(worktree),
  )
  expect(await liveDiffWorktrees(root, signal)).toEqual([
    realpathSync(root),
    realpathSync(worktree),
  ])
})
