import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  discardGitFiles,
  loadGitCommitHistory,
  loadGitDiff,
  loadGitFiles,
  loadGitRefSignature,
  loadGitSnapshot,
  loadGitWorkingTreeSnapshot,
  stageGitFiles,
  toggleGitFile,
  unstageGitFiles,
} from "../packages/feature-git/src/services/git"
import {
  applyGitPartialStage,
  applyGitPartialStageChanges,
  loadGitPartialStageState,
  loadGitPartialStageSource,
} from "../packages/feature-git/src/services/git-partial-stage"
import {
  buildGitPartialStagePatch,
  gitPartialStageChangeLineIds,
  gitPartialStageTargets,
} from "../packages/feature-git/src/model/git-partial-stage"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-git-file-paths-"))
afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" })
}

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function repository(selected: string, neighbor: string, committed: boolean) {
  const root = mkdtempSync(join(temporaryDirectory, "repository-"))
  git(root, "init", "--quiet")
  git(root, "config", "user.name", "Git path fixture")
  git(root, "config", "user.email", "git-path-fixture@example.invalid")
  git(root, "config", "commit.gpgSign", "false")
  git(root, "config", "core.hooksPath", join(temporaryDirectory, "no-hooks"))
  write(root, selected, "selected base\n")
  write(root, neighbor, "neighbor base\n")
  if (committed) {
    git(root, "add", "--all")
    git(root, "commit", "--quiet", "-m", "Fixture")
  }
  return root
}

async function selectedFile(root: string, path: string) {
  const file = (await loadGitSnapshot(root)).files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing fixture path: ${path}`)
  return file
}

function stagedPaths(root: string) {
  return git(root, "diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean)
}

test.each(["hunk", "line"] as const)(
  "%s stages and unstages code that resembles patch headers",
  async (granularity) => {
    const root = repository("partial.txt", "neighbor.txt", false)
    const original = "-- old section\n--tail\nstable\n"
    const modified = "++ new section\n++tail\nstable\n"
    write(root, "partial.txt", original)
    git(root, "add", "--all")
    git(root, "commit", "--quiet", "-m", "Header-like fixture")
    write(root, "partial.txt", modified)
    const file = await selectedFile(root, "partial.txt")
    const state = await loadGitPartialStageState(root, file)
    const document = state.documents.unstaged
    if (!document) throw new Error("Missing partial-stage document")
    const selected = new Set(
      gitPartialStageTargets(document, granularity).map((target) => target.id),
    )
    const addPatch = buildGitPartialStagePatch({ document, granularity, selected })
    await applyGitPartialStageChanges({
      root,
      file,
      expectedSources: state.sources,
      addPatch,
      removePatch: "",
    })
    expect(git(root, "show", ":partial.txt")).toBe(modified)
    expect(git(root, "diff", "--", "partial.txt")).toBe("")

    const stagedFile = await selectedFile(root, "partial.txt")
    const staged = await loadGitPartialStageState(root, stagedFile)
    const stagedDocument = staged.documents.staged
    if (!stagedDocument) throw new Error("Missing staged document")
    const removePatch = buildGitPartialStagePatch({
      document: stagedDocument,
      granularity,
      selected: new Set(
        gitPartialStageTargets(stagedDocument, granularity).map((target) => target.id),
      ),
    })
    await applyGitPartialStageChanges({
      root,
      file: stagedFile,
      expectedSources: staged.sources,
      addPatch: "",
      removePatch,
    })
    expect(git(root, "show", ":partial.txt")).toBe(original)
    expect(readFileSync(join(root, "partial.txt"), "utf8")).toBe(modified)
    expect(git(root, "diff", "--cached")).toBe("")
    expect(readFileSync(join(root, "neighbor.txt"), "utf8")).toBe("neighbor base\n")
  },
)

const paths = [
  ["*.txt", "neighbor.txt"],
  ["file?.txt", "file1.txt"],
  ["nested/[ab].txt", "nested/a.txt"],
  [":(glob)*.txt", "neighbor.txt"],
  [":(exclude)neighbor.txt", "neighbor.txt"],
  ["-space 日本語.txt", "neighbor.txt"],
] as const

describe.each(paths)("Git single-file operations for %s", (selected, neighbor) => {
  test("stages only the selected untracked file", async () => {
    const root = repository(selected, neighbor, false)

    await toggleGitFile(root, await selectedFile(root, selected))

    expect(stagedPaths(root)).toEqual([selected])
    expect(await selectedFile(root, neighbor)).toMatchObject({ untracked: true })
  })

  test("stages only the selected tracked modification", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected change\n")
    write(root, neighbor, "neighbor change\n")

    await toggleGitFile(root, await selectedFile(root, selected))

    expect(stagedPaths(root)).toEqual([selected])
    expect(await selectedFile(root, neighbor)).toMatchObject({ staged: false, unstaged: true })
  })

  test("previews only the selected staged and unstaged changes", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected staged\n")
    write(root, neighbor, "neighbor staged\n")
    git(root, "add", "--all")
    write(root, selected, "selected worktree\n")
    write(root, neighbor, "neighbor worktree\n")

    const diff = await loadGitDiff(root, await selectedFile(root, selected))

    expect(diff).toContain("── STAGED ──")
    expect(diff).toContain("+selected staged")
    expect(diff).toContain("── WORKTREE ──")
    expect(diff).toContain("+selected worktree")
    expect(diff).not.toContain("+neighbor staged")
    expect(diff).not.toContain("+neighbor worktree")
  })

  for (const committed of [true, false]) {
    test(`unstages only the selected file ${committed ? "after" : "before"} the first commit`, async () => {
      const root = repository(selected, neighbor, committed)
      write(root, selected, "selected change\n")
      write(root, neighbor, "neighbor change\n")
      git(root, "add", "--all")

      await toggleGitFile(root, await selectedFile(root, selected))

      expect(stagedPaths(root)).toEqual([neighbor])
      expect(await selectedFile(root, selected)).toMatchObject({ staged: false, unstaged: true })
      expect(readFileSync(join(root, selected), "utf8")).toBe("selected change\n")
      expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor change\n")
    })
  }

  test("discards only the selected tracked file", async () => {
    const root = repository(selected, neighbor, true)
    write(root, selected, "selected change\n")
    write(root, neighbor, "neighbor change\n")
    await discardGitFiles(root, [await selectedFile(root, selected)])
    expect(readFileSync(join(root, selected), "utf8")).toBe("selected base\n")
    expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor change\n")
  })

  test("removes only the selected untracked file", async () => {
    const root = repository(selected, neighbor, false)
    await discardGitFiles(root, [await selectedFile(root, selected)])
    expect(existsSync(join(root, selected))).toBe(false)
    expect(readFileSync(join(root, neighbor), "utf8")).toBe("neighbor base\n")
  })
})

test("folder actions cascade only through files inside the selected folder", async () => {
  const root = repository("src/a.txt", "src/nested/b.txt", true)
  write(root, "src/a.txt", "a changed\n")
  write(root, "src/nested/b.txt", "b changed\n")
  write(root, "outside.txt", "outside new\n")
  const snapshot = await loadGitSnapshot(root)
  const folderFiles = snapshot.files.filter((file) => file.path.startsWith("src/"))
  const commands: string[][] = []
  await stageGitFiles(root, folderFiles, (args) => commands.push([...args]))
  expect(stagedPaths(root)).toEqual(["src/a.txt", "src/nested/b.txt"])
  expect(commands.flat().join(" ")).toContain("src/a.txt")

  await unstageGitFiles(
    root,
    (await loadGitSnapshot(root)).files.filter((file) => file.path.startsWith("src/")),
    (args) => commands.push([...args]),
  )
  expect(stagedPaths(root)).toEqual([])
  expect(commands.some((args) => args.includes("restore") && args.includes("src/a.txt"))).toBe(true)

  await discardGitFiles(
    root,
    (await loadGitSnapshot(root)).files.filter((file) => file.path.startsWith("src/")),
  )
  expect(readFileSync(join(root, "src/a.txt"), "utf8")).toBe("selected base\n")
  expect(readFileSync(join(root, "src/nested/b.txt"), "utf8")).toBe("neighbor base\n")
  expect(readFileSync(join(root, "outside.txt"), "utf8")).toBe("outside new\n")
})

test("folder stage can be restored before the first commit", async () => {
  const root = repository("src/a.txt", "src/nested/b.txt", false)
  write(root, "outside.txt", "outside new\n")
  const folderFiles = (await loadGitSnapshot(root)).files.filter((file) =>
    file.path.startsWith("src/"),
  )

  await stageGitFiles(root, folderFiles)
  expect(stagedPaths(root)).toEqual(["src/a.txt", "src/nested/b.txt"])
  await unstageGitFiles(
    root,
    (await loadGitSnapshot(root)).files.filter((file) => file.path.startsWith("src/")),
  )

  expect(stagedPaths(root)).toEqual([])
  expect(readFileSync(join(root, "src/a.txt"), "utf8")).toBe("selected base\n")
  expect(readFileSync(join(root, "src/nested/b.txt"), "utf8")).toBe("neighbor base\n")
  expect(readFileSync(join(root, "outside.txt"), "utf8")).toBe("outside new\n")
})

test("loads working-tree status independently from commit history", async () => {
  const root = repository("src/a.txt", "src/b.txt", true)
  write(root, "src/a.txt", "changed\n")

  const workingTree = await loadGitWorkingTreeSnapshot(root)
  expect(workingTree.files).toEqual(await loadGitFiles(root))
  expect(workingTree.commits).toEqual([])
  const history = await loadGitCommitHistory(root)
  expect(history).toHaveLength(1)
  expect(history[0]?.filesChanged).toBe(2)

  const signatureBeforeCommit = await loadGitRefSignature(root)
  git(root, "add", "src/a.txt")
  git(root, "commit", "--quiet", "-m", "second", "-m", "Detailed body")
  expect(await loadGitRefSignature(root)).not.toBe(signatureBeforeCommit)
  const latest = (await loadGitCommitHistory(root))[0]
  expect(latest).toMatchObject({
    author: "Git path fixture",
    authorEmail: "git-path-fixture@example.invalid",
    subject: "second",
    body: "Detailed body\n",
    filesChanged: 1,
    additions: 1,
    deletions: 1,
  })
  expect(latest?.relativeDate).toMatch(/ago$/)
})

test("partially stages one selected hunk and leaves the other in the worktree", async () => {
  const root = repository("partial.txt", "neighbor.txt", true)
  write(root, "partial.txt", "one\ntwo\nthree\nfour\nfive\nsix\n")
  git(root, "add", "partial.txt")
  git(root, "commit", "--quiet", "-m", "partial base")
  write(root, "partial.txt", "ONE\ntwo\nthree\nfour\nFIVE\nsix\n")
  const file = await selectedFile(root, "partial.txt")
  const document = await loadGitPartialStageSource(root, file)
  expect(document.hunks).toHaveLength(2)
  const firstHunk = document.hunks[0]
  if (!firstHunk) throw new Error("Expected the first partial-stage hunk")
  const patch = buildGitPartialStagePatch({
    document,
    granularity: "hunk",
    selected: new Set([firstHunk.id]),
  })
  const commands: string[][] = []

  await applyGitPartialStage({
    root,
    file,
    expectedSource: document.source,
    patch,
    observer: (args) => commands.push([...args]),
  })

  const staged = git(root, "diff", "--cached")
  const unstaged = git(root, "diff")
  expect(staged).toContain("+ONE")
  expect(staged).not.toContain("+FIVE")
  expect(unstaged).toContain("+FIVE")
  expect(unstaged).not.toContain("+ONE")
  expect(commands).toEqual([["apply", "--cached", "--unidiff-zero", "--whitespace=nowarn", "-"]])
})

test("partial stage reloads indexed lines and can move them back to the worktree", async () => {
  const root = repository("partial.txt", "neighbor.txt", true)
  write(root, "partial.txt", "first change\n")
  git(root, "add", "partial.txt")
  const file = await selectedFile(root, "partial.txt")
  const state = await loadGitPartialStageState(root, file)
  const stagedDocument = state.documents.staged
  if (!stagedDocument) throw new Error("Expected staged changes to be selectable")
  const removePatch = buildGitPartialStagePatch({
    document: stagedDocument,
    granularity: "line",
    selected: new Set(gitPartialStageChangeLineIds(stagedDocument)),
  })

  await applyGitPartialStageChanges({
    root,
    file,
    expectedSources: state.sources,
    addPatch: "",
    removePatch,
  })

  expect(git(root, "diff", "--cached")).toBe("")
  expect(git(root, "diff")).toContain("+first change")
})

test("partial stage can exchange disjoint indexed and worktree hunks in one apply", async () => {
  const root = repository("partial.txt", "neighbor.txt", true)
  write(root, "partial.txt", "one\ntwo\nthree\nfour\nfive\nsix\n")
  git(root, "add", "partial.txt")
  git(root, "commit", "--quiet", "-m", "partial base")
  write(root, "partial.txt", "ONE\ntwo\nthree\nfour\nFIVE\nsix\n")
  const initialFile = await selectedFile(root, "partial.txt")
  const initialDocument = await loadGitPartialStageSource(root, initialFile)
  const firstHunk = initialDocument.hunks[0]
  if (!firstHunk) throw new Error("Expected the first worktree hunk")
  await applyGitPartialStage({
    root,
    file: initialFile,
    expectedSource: initialDocument.source,
    patch: buildGitPartialStagePatch({
      document: initialDocument,
      granularity: "hunk",
      selected: new Set([firstHunk.id]),
    }),
  })

  const file = await selectedFile(root, "partial.txt")
  const state = await loadGitPartialStageState(root, file)
  const stagedDocument = state.documents.staged
  const unstagedDocument = state.documents.unstaged
  if (!stagedDocument || !unstagedDocument) throw new Error("Expected both partial-stage sources")
  await applyGitPartialStageChanges({
    root,
    file,
    expectedSources: state.sources,
    addPatch: buildGitPartialStagePatch({
      document: unstagedDocument,
      granularity: "line",
      selected: new Set(gitPartialStageChangeLineIds(unstagedDocument)),
    }),
    removePatch: buildGitPartialStagePatch({
      document: stagedDocument,
      granularity: "line",
      selected: new Set(gitPartialStageChangeLineIds(stagedDocument)),
    }),
  })

  const staged = git(root, "diff", "--cached")
  expect(staged).not.toContain("+ONE")
  expect(staged).toContain("+FIVE")
})

test("partial stage restores the index if a second overlapping direction cannot apply", async () => {
  const root = repository("partial.txt", "neighbor.txt", true)
  write(root, "partial.txt", "indexed change\n")
  git(root, "add", "partial.txt")
  write(root, "partial.txt", "worktree change\n")
  const file = await selectedFile(root, "partial.txt")
  const state = await loadGitPartialStageState(root, file)
  const stagedDocument = state.documents.staged
  const unstagedDocument = state.documents.unstaged
  if (!stagedDocument || !unstagedDocument) throw new Error("Expected both partial-stage sources")
  const patchFor = (document: typeof stagedDocument) =>
    buildGitPartialStagePatch({
      document,
      granularity: "line",
      selected: new Set(gitPartialStageChangeLineIds(document)),
    })

  await expect(
    applyGitPartialStageChanges({
      root,
      file,
      expectedSources: state.sources,
      addPatch: patchFor(unstagedDocument),
      removePatch: patchFor(stagedDocument),
    }),
  ).rejects.toThrow()

  const staged = git(root, "diff", "--cached")
  expect(staged).toContain("+indexed change")
  expect(staged).not.toContain("+worktree change")
})

test("partial stage treats wildcard-looking filenames as literal paths", async () => {
  const root = repository("*.txt", "neighbor.txt", true)
  write(root, "*.txt", "selected change\n")
  write(root, "neighbor.txt", "neighbor change\n")
  const file = await selectedFile(root, "*.txt")
  const document = await loadGitPartialStageSource(root, file)
  const firstHunk = document.hunks[0]
  if (!firstHunk) throw new Error("Expected a literal-path partial-stage hunk")
  const patch = buildGitPartialStagePatch({
    document,
    granularity: "hunk",
    selected: new Set([firstHunk.id]),
  })

  await applyGitPartialStage({ root, file, expectedSource: document.source, patch })

  expect(stagedPaths(root)).toEqual(["*.txt"])
  expect(await selectedFile(root, "neighbor.txt")).toMatchObject({ staged: false, unstaged: true })
})

test("rejects a partial stage when the source changed after selection", async () => {
  const root = repository("stale.txt", "neighbor.txt", true)
  write(root, "stale.txt", "first change\n")
  const file = await selectedFile(root, "stale.txt")
  const document = await loadGitPartialStageSource(root, file)
  const firstHunk = document.hunks[0]
  if (!firstHunk) throw new Error("Expected a stale partial-stage hunk")
  const patch = buildGitPartialStagePatch({
    document,
    granularity: "hunk",
    selected: new Set([firstHunk.id]),
  })
  write(root, "stale.txt", "later change\n")

  await expect(
    applyGitPartialStage({ root, file, expectedSource: document.source, patch }),
  ).rejects.toThrow(/mudou após a seleção/)
  expect(stagedPaths(root)).toEqual([])
})
