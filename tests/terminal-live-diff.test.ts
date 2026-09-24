import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { displayWidth } from "../packages/core/src/i18n/index"
import {
  liveDiffTotals,
  mergeLiveDiffFiles,
  parseLiveDiffNameStatus,
  parseLiveDiffNumstat,
  parseLiveDiffStatus,
} from "../packages/feature-terminal/src/model/live-diff"
import {
  changedHunkLineIndex,
  type LiveDiffPatchHistory,
  latestChangedHunkIndex,
  observeLiveDiffPatch,
  prepareLiveDiffPatch,
  recentDiffLines,
} from "../packages/feature-terminal/src/rendering/live-diff-hunks"
import {
  abbreviatedFolder,
  fittedLiveDiffPath,
  liveDiffDisplayPath,
  liveDiffFileStatus,
  liveDiffPathWidth,
  liveDiffRowBackground,
  liveDiffRowHighlightProgress,
  liveDiffUnwrappedHeight,
  liveDiffWrappedHeight,
} from "../packages/feature-terminal/src/rendering/live-diff-table"
import {
  liveDiffRepositoryRoot,
  liveDiffWorktrees,
  readLiveDiffPatch,
  readLiveDiffRoot,
} from "../packages/feature-terminal/src/services/live-diff"
import { discoverLiveDiffProjects } from "../packages/feature-terminal/src/services/live-diff-projects"

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
  expect(
    parseLiveDiffStatus(" M packages/a b.ts\0?? tabs\there.txt\0R  new name.ts\0old name.ts\0"),
  ).toEqual([
    { status: " M", path: "packages/a b.ts" },
    { status: "??", path: "tabs\there.txt" },
    { status: "R ", path: "new name.ts", originalPath: "old name.ts" },
  ])
  expect(
    parseLiveDiffNameStatus("D\0gone.ts\0R100\0old.ts\0new.ts\0C90\0a.ts\0b.ts\0T\0type.ts\0"),
  ).toEqual(
    new Map([
      ["gone.ts", { code: "D" }],
      ["new.ts", { code: "R", originalPath: "old.ts" }],
      ["b.ts", { code: "C", originalPath: "a.ts" }],
      ["type.ts", { code: "T" }],
    ]),
  )
  expect(
    parseLiveDiffNumstat("2\t1\tpackages/a b.ts\0-\t-\tasset.bin\0" + "0\t0\t\0old.ts\0new.ts\0"),
  ).toEqual(
    new Map([
      ["packages/a b.ts", { additions: 2, deletions: 1 }],
      ["asset.bin", { additions: null, deletions: null }],
      ["new.ts", { additions: 0, deletions: 0 }],
    ]),
  )
})

test("classifies deleted, renamed, copied and type-changed files", async () => {
  const root = repository()
  write(root, "delete.ts", "delete me\n")
  write(root, "rename.ts", "rename me\n")
  write(root, "copy.ts", "copy me\n")
  git(root, "add", "--all")
  git(root, "commit", "--quiet", "-m", "status fixture")

  rmSync(join(root, "delete.ts"))
  git(root, "mv", "rename.ts", "renamed.ts")
  copyFileSync(join(root, "copy.ts"), join(root, "copied.ts"))
  git(root, "add", "--all")

  const files = (await readLiveDiffRoot(root, new AbortController().signal)).files
  expect(liveDiffFileStatus(files.find((file) => file.path === "delete.ts")!)).toBe("Delete")
  expect(files.find((file) => file.path === "renamed.ts")).toMatchObject({
    change: "Rename",
    originalPath: "rename.ts",
  })
  expect(files.find((file) => file.path === "copied.ts")).toMatchObject({
    change: "Copy",
    originalPath: "copy.ts",
  })
  expect(liveDiffFileStatus({ ...files[0]!, change: "Type" })).toBe("Type")
})

test("discovers nearby Git projects for the Live Diff picker", async () => {
  const parent = mkdtempSync(join(tmpdir(), "tuiminal-live-diff-projects-"))
  temporary.push(parent)
  const current = join(parent, "current")
  const sibling = join(parent, "sibling")
  const ignored = join(parent, "node_modules", "hidden")
  for (const project of [current, sibling, ignored])
    mkdirSync(join(project, ".git"), { recursive: true })
  const previousRoots = process.env.TUIMINAL_PROJECT_ROOTS
  process.env.TUIMINAL_PROJECT_ROOTS = parent
  try {
    const projects = await discoverLiveDiffProjects([current], new AbortController().signal)
    expect(projects.map((project) => project.name)).toEqual(["current", "sibling"])
    expect(projects.every((project) => project.parent === basename(parent))).toBe(true)
  } finally {
    if (previousRoots === undefined) delete process.env.TUIMINAL_PROJECT_ROOTS
    else process.env.TUIMINAL_PROJECT_ROOTS = previousRoots
  }
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
  expect(liveDiffUnwrappedHeight("@@ -1 +1 @@\n+abcdefghijklmnopqrstuvwx\n")).toBe(3)
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

  const highlighted = mergeLiveDiffFiles(
    next,
    [file("a.ts", "a3"), file("b.ts", "b3"), file("c.ts", "c1")],
    3000,
    new Set([root]),
  )
  expect(highlighted.map(({ path, listHighlightAt }) => [path, listHighlightAt])).toEqual([
    ["a.ts", 3000],
    ["b.ts", 3000],
    ["c.ts", 3000],
  ])
  expect(
    mergeLiveDiffFiles(
      highlighted,
      [file("a.ts", "a3"), file("b.ts", "b3"), file("c.ts", "c1")],
      4000,
      new Set([root]),
    ).map(({ listHighlightAt }) => listHighlightAt),
  ).toEqual([3000, 3000, 3000])
  expect(mergeLiveDiffFiles([], [file("initial.ts", "first")], 3000)[0]?.listHighlightAt).toBe(
    undefined,
  )
})

test("Live Diff file-row highlight fades completely in two seconds", () => {
  expect(liveDiffRowHighlightProgress(1000, 1000)).toBe(1)
  expect(liveDiffRowHighlightProgress(1000, 2000)).toBe(0.5)
  expect(liveDiffRowHighlightProgress(1000, 3000)).toBe(0)
  expect(liveDiffRowHighlightProgress(undefined, 1000)).toBe(0)
  expect(liveDiffRowBackground("#000000", "#ffffff", 1)).toBe("#ffffff")
  expect(liveDiffRowBackground("#000000", "#ffffff", 0.5)).toBe("#808080")
  expect(liveDiffRowBackground("#000000", "#ffffff", 0)).toBe("#000000")
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

test("Live Diff identifies fresh lines on repeated edits to the same file", () => {
  const first = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n before\n-old\n+first\n after\n@@ -10,2 +10,2 @@\n-other\n+second\n`
  const second = first.replace("+first", "+first again")
  const third = second.replace("+second", "+second again")
  expect(recentDiffLines(null, first)).toEqual([])
  expect(recentDiffLines(first, second)).toEqual([{ line: 2, kind: "added" }])
  expect(recentDiffLines(second, third)).toEqual([{ line: 5, kind: "added" }])
  expect(recentDiffLines(first, third)).toEqual([
    { line: 2, kind: "added" },
    { line: 5, kind: "added" },
  ])
  expect(recentDiffLines(third, third)).toEqual([])
  expect(recentDiffLines(third, third.replace("@@ -10,2 +10,2 @@", "@@ -12,2 +12,2 @@"))).toEqual(
    [],
  )
  const fourth = third.replace("+second again", "+second again\n+extra\n+another")
  expect(recentDiffLines(third, fourth)).toEqual([
    { line: 6, kind: "added" },
    { line: 7, kind: "added" },
  ])
  const fifth = fourth.replace("-other", "-older")
  expect(recentDiffLines(fourth, fifth)).toEqual([{ line: 4, kind: "removed" }])

  const history = new Map<string, LiveDiffPatchHistory>()
  expect(observeLiveDiffPatch(history, "a.ts", first).highlighted).toEqual([])
  expect(observeLiveDiffPatch(history, "a.ts", second).highlighted).toEqual([
    { line: 2, kind: "added" },
  ])
  const accumulated = observeLiveDiffPatch(history, "a.ts", third)
  expect(accumulated.highlighted).toEqual([
    { line: 2, kind: "added" },
    { line: 5, kind: "added" },
  ])
  expect(accumulated.recent).toEqual([{ line: 5, kind: "added" }])
  observeLiveDiffPatch(history, "b.ts", first)
  expect(observeLiveDiffPatch(history, "a.ts", third)).toMatchObject({
    highlighted: accumulated.highlighted,
    recent: [],
    changed: false,
  })
  for (let index = 0; index < 16; index++) observeLiveDiffPatch(history, `other-${index}`, first)
  expect(history.size).toBe(16)
  expect(observeLiveDiffPatch(history, "a.ts", third).highlighted).toEqual([])

  const initiallyRecent = new Map<string, LiveDiffPatchHistory>()
  expect(observeLiveDiffPatch(initiallyRecent, "late.ts", first, true).highlighted).toEqual([
    { line: 1, kind: "removed" },
    { line: 2, kind: "added" },
    { line: 4, kind: "removed" },
    { line: 5, kind: "added" },
  ])
})

test("Live Diff inserts one valid visual row between hunks", () => {
  const source = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n@@ -10,2 +10,2 @@\n-before\n+after\n tail\n`
  const prepared = prepareLiveDiffPatch(source)
  expect(prepared.patch).toContain("@@ -1,3 +1,3 @@\n-old\n+new\n same\n \n@@ -10,2 +10,2 @@")
  expect(prepared.separatorLines).toEqual([3])
  expect(liveDiffUnwrappedHeight(prepared.patch)).toBe(liveDiffUnwrappedHeight(source) + 1)
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
