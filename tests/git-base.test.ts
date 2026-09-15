import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parsePatch } from "diff"
import { COLORS } from "../packages/core/src/settings/theme"
import {
  compactGitActionFooter,
  gitActionLabel,
  gitDiffHorizontalScrollDelta,
  gitPaneFocusTarget,
} from "../packages/feature-git/src/model/base-navigation"
import {
  applyGitCommandCompletion,
  type GitCommandCompletionData,
  gitCommandCompletions,
} from "../packages/feature-git/src/model/git-command-autocomplete"
import {
  displayGitCommand,
  gitConsoleOutputLines,
  optimisticGitDiscard,
  optimisticGitStage,
  parseGitCommandInput,
} from "../packages/feature-git/src/model/git-command-console"
import {
  gitCommitBodyLines,
  gitCommitLogRowHeight,
  gitCommitLogWindow,
} from "../packages/feature-git/src/model/git-commit-log"
import {
  buildGitPartialStagePatch,
  gitPartialStageTargets,
  parseGitPartialStagePatch,
} from "../packages/feature-git/src/model/git-partial-stage"
import type { GitCommit } from "../packages/feature-git/src/model/types"
import {
  createFileTreeOptions,
  createPathTreeOptions,
} from "../packages/feature-git/src/rendering/file-tree"
import {
  GitCommandBudgetError,
  runGitCommand,
  trimGitPatchTerminator,
} from "../packages/feature-git/src/services/git"
import { loadGitCommandCompletionData } from "../packages/feature-git/src/services/git-command-autocomplete"
import { gitCommandConsoleHeight } from "../packages/feature-git/src/ui/base/GitCommandConsole"
import {
  gitFileTreeOptionHeight,
  gitFileTreeVisibleWindow,
  gitStatusColor,
} from "../packages/feature-git/src/ui/base/GitFileTree"

describe("Git patch rendering", () => {
  test("preserves a final empty added line while removing Git's record terminator", () => {
    const patch = [
      "diff --git a/example.txt b/example.txt",
      "index 1f7391f..a63f0c0 100644",
      "--- a/example.txt",
      "+++ b/example.txt",
      "@@ -1 +1,2 @@",
      " value",
      "+",
      "",
    ].join("\n")

    const normalized = trimGitPatchTerminator(patch)
    expect(normalized.endsWith("+")).toBe(true)
    expect(() => parsePatch(normalized)).not.toThrow()
  })

  test("bounds command output and execution time", async () => {
    await expect(
      runGitCommand(process.cwd(), ["--version"], { maxOutputBytes: 4 }),
    ).rejects.toBeInstanceOf(GitCommandBudgetError)
    const startedAt = performance.now()
    await expect(
      runGitCommand(process.cwd(), ["-c", "alias.wait=!sleep 2", "wait"], {
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/prazo/i)
    expect(performance.now() - startedAt).toBeLessThan(1_000)
  })
})

describe("Git partial stage patches", () => {
  const source = [
    "diff --git a/example.txt b/example.txt",
    "--- a/example.txt",
    "+++ b/example.txt",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "@@ -5,0 +6 @@",
    "+six",
    "",
  ].join("\n")
  const document = parseGitPartialStagePatch(source)
  if (!document) throw new Error("Expected a selectable partial-stage document")

  test("exposes hunks and changed lines as separate navigation targets", () => {
    expect(gitPartialStageTargets(document, "hunk")).toEqual([
      { id: "hunk:0", hunkIndex: 0, lineIndex: null, rowIndex: 0 },
      { id: "hunk:1", hunkIndex: 1, lineIndex: null, rowIndex: 3 },
    ])
    expect(gitPartialStageTargets(document, "line").map((target) => target.id)).toEqual([
      "line:0:0",
      "line:0:1",
      "line:1:0",
    ])
  })

  test("builds a patch containing only selected hunks", () => {
    const patch = buildGitPartialStagePatch({
      document,
      granularity: "hunk",
      selected: new Set(["hunk:1"]),
    })
    expect(patch).toContain("@@ -5,0 +6,1 @@")
    expect(patch).toContain("+six")
    expect(patch).not.toContain("-old")
  })

  test("turns an unselected removal into context when selecting an added line", () => {
    const patch = buildGitPartialStagePatch({
      document,
      granularity: "line",
      selected: new Set(["line:0:1"]),
    })
    expect(patch).toContain("@@ -1,1 +1,2 @@")
    expect(patch).toContain(" old\n+new")
    expect(patch).not.toContain("-old")
  })
})

describe("Git commit log", () => {
  const commit: GitCommit = {
    fullHash: "a".repeat(40),
    hash: "aaaaaaa",
    date: "2026-09-12",
    relativeDate: "30 hours ago",
    author: "Tuiminal Test",
    authorEmail: "tuiminal@example.test",
    decorations: "main",
    parents: ["b".repeat(40)],
    subject: "regular commit",
    body: "",
    filesChanged: 2,
    additions: 3,
    deletions: 1,
  }
  const merge = {
    ...commit,
    fullHash: "c".repeat(40),
    hash: "ccccccc",
    parents: ["a".repeat(40), "b".repeat(40)],
    subject: "merge commit",
    body: "# Conflicts:\n# AGENTS.md\n# README.md",
  }

  test("reserves the complete variable-height commit block", () => {
    expect(gitCommitLogRowHeight(commit)).toBe(6)
    expect(gitCommitLogRowHeight(merge)).toBe(11)
    expect(gitCommitLogWindow([commit, merge, commit], 1, 17)).toEqual({ start: 0, end: 2 })
    expect(gitCommitLogWindow([commit, merge, commit], 2, 17)).toEqual({ start: 1, end: 3 })
  })

  test("bounds long commit bodies inside the history viewport", () => {
    const lines = gitCommitBodyLines({
      ...commit,
      body: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight",
    })
    expect(lines).toEqual(["one", "two", "three", "four", "five", "…"])
  })
})

describe("Git action footer", () => {
  test("uses compact controls when the preview pane cannot fit full labels", () => {
    expect(compactGitActionFooter(39)).toBe(true)
    expect(compactGitActionFooter(81)).toBe(true)
    expect(compactGitActionFooter(82)).toBe(false)
  })

  test("keeps every compact control as a complete bracketed shortcut", () => {
    expect(gitActionLabel(true, "[␠] Stage")).toBe("[␠]")
    expect(gitActionLabel(true, "[R] Sync")).toBe("[R]")
    expect(gitActionLabel(false, "[R] Sync")).toBe("[R] Sync")
  })

  test("moves between the file tree and diff without reserving L for the log", () => {
    expect(gitPaneFocusTarget("tab", "files")).toBe("preview")
    expect(gitPaneFocusTarget("tab", "preview")).toBe("terminal")
    expect(gitPaneFocusTarget("tab", "terminal")).toBe("files")
    expect(gitPaneFocusTarget("l", "files")).toBe("preview")
    expect(gitPaneFocusTarget("right", "files")).toBe("preview")
    expect(gitPaneFocusTarget("h", "preview")).toBe("files")
    expect(gitPaneFocusTarget("left", "terminal")).toBe("files")
    expect(gitPaneFocusTarget("o", "files")).toBeNull()
  })

  test("reserves shifted horizontal keys for diff scrolling", () => {
    expect(gitDiffHorizontalScrollDelta("h", true)).toBe(-8)
    expect(gitDiffHorizontalScrollDelta("left", true)).toBe(-8)
    expect(gitDiffHorizontalScrollDelta("l", true)).toBe(8)
    expect(gitDiffHorizontalScrollDelta("right", true)).toBe(8)
    expect(gitDiffHorizontalScrollDelta("l", false)).toBe(0)
    expect(gitDiffHorizontalScrollDelta("j", true)).toBe(0)
  })
})

describe("Git command console", () => {
  test("reserves seven output rows in both layouts", () => {
    expect(gitCommandConsoleHeight(true)).toBe(9)
    expect(gitCommandConsoleHeight(false)).toBe(11)
  })

  test("keeps git fixed and parses quoted arguments without invoking a shell", () => {
    expect(parseGitCommandInput(`status --short "path with spaces"`)).toEqual([
      "status",
      "--short",
      "path with spaces",
    ])
    expect(parseGitCommandInput("git diff -- 'it'\\''s.txt'")).toEqual(["diff", "--", "it's.txt"])
    expect(displayGitCommand(["add", "--", "path with spaces"])).toBe(
      "git add -- 'path with spaces'",
    )
    expect(() => parseGitCommandInput("status '")).toThrow(/aspas/)
  })

  test("preserves command output as terminal lines", () => {
    expect(gitConsoleOutputLines("On branch main\r\n\r\n  changed file\r\n")).toEqual([
      "On branch main",
      "",
      "  changed file",
    ])
  })

  test("completes commands, branches, refs, remotes, options, and changed paths", () => {
    const data: GitCommandCompletionData = {
      branches: [
        { name: "main", kind: "local", current: true },
        { name: "feature/keyboard", kind: "local", current: false },
        { name: "origin/feature/remote", kind: "remote", current: false },
      ],
      tags: ["v1.0.0"],
      remotes: ["origin"],
      paths: ["src/app.ts", "path with spaces.txt"],
    }
    expect(gitCommandCompletions({ input: "sw", data })).toEqual([
      { value: "switch", kind: "command" },
    ])
    expect(gitCommandCompletions({ input: "switch fea", data })).toEqual([
      { value: "feature/keyboard", kind: "localBranch" },
    ])
    expect(gitCommandCompletions({ input: "switch origin/", data })).toEqual([
      { value: "origin/feature/remote", kind: "remoteBranch" },
    ])
    expect(gitCommandCompletions({ input: "switch ", data })[0]).toEqual({
      value: "main",
      kind: "currentBranch",
    })
    expect(gitCommandCompletions({ input: "push ", data })[0]).toEqual({
      value: "origin",
      kind: "remote",
    })
    expect(gitCommandCompletions({ input: "diff v", data })).toEqual([
      { value: "v1.0.0", kind: "tag" },
    ])
    expect(gitCommandCompletions({ input: "status --s", data })[0]).toEqual({
      value: "--short",
      kind: "option",
    })
    expect(
      applyGitCommandCompletion({
        input: "add path",
        completion: { value: "path with spaces.txt", kind: "path" },
      }),
    ).toEqual({ value: "add 'path with spaces.txt' ", cursorOffset: 27 })
    expect(
      applyGitCommandCompletion({
        input: "switch ma --detach",
        cursorOffset: 9,
        completion: { value: "main", kind: "currentBranch" },
      }),
    ).toEqual({ value: "switch main --detach", cursorOffset: 11 })
  })

  test("loads local, remote, and current branches without contacting a remote", async () => {
    const repository = mkdtempSync(join(tmpdir(), "tuiminal-git-completion-"))
    try {
      execFileSync("git", ["init", "--quiet", "--initial-branch=main", repository])
      writeFileSync(join(repository, "README.md"), "completion\n")
      execFileSync("git", ["-C", repository, "add", "README.md"])
      execFileSync("git", [
        "-C",
        repository,
        "-c",
        "user.name=Tuiminal Test",
        "-c",
        "user.email=tuiminal@example.test",
        "commit",
        "--quiet",
        "-m",
        "base",
      ])
      execFileSync("git", ["-C", repository, "branch", "feature/keyboard"])
      execFileSync("git", ["-C", repository, "update-ref", "refs/remotes/origin/demo", "HEAD"])
      execFileSync("git", [
        "-C",
        repository,
        "remote",
        "add",
        "origin",
        "https://example.test/tuiminal.git",
      ])
      execFileSync("git", ["-C", repository, "tag", "v1.0.0"])

      const data = await loadGitCommandCompletionData(repository)
      expect(data.branches).toContainEqual({ name: "main", kind: "local", current: true })
      expect(data.branches).toContainEqual({
        name: "feature/keyboard",
        kind: "local",
        current: false,
      })
      expect(data.branches).toContainEqual({
        name: "origin/demo",
        kind: "remote",
        current: false,
      })
      expect(data.tags).toEqual(["v1.0.0"])
      expect(data.remotes).toEqual(["origin"])
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })

  test("applies stage and discard immediately to the visual snapshot", () => {
    const changed = {
      path: "src/app.ts",
      indexStatus: " ",
      worktreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false,
    }
    const staged = optimisticGitStage([changed], [changed], "stage")
    expect(staged[0]).toMatchObject({ indexStatus: "M", worktreeStatus: " ", staged: true })
    expect(optimisticGitStage(staged, staged, "unstage")[0]).toMatchObject({
      indexStatus: " ",
      worktreeStatus: "M",
      staged: false,
    })
    expect(optimisticGitDiscard([changed], [changed])).toEqual([])
  })
})

describe("Git file tree", () => {
  test("shows only Git status codes and keeps their semantic colors distinct", () => {
    const options = createFileTreeOptions(
      [
        {
          path: "src/tracked.ts",
          indexStatus: "M",
          worktreeStatus: " ",
          staged: true,
          unstaged: false,
          untracked: false,
        },
        {
          path: "new.ts",
          indexStatus: "?",
          worktreeStatus: "?",
          staged: false,
          unstaged: true,
          untracked: true,
        },
      ],
      new Set(),
    )
    expect(options.map((option) => option.name)).toEqual(["▾ src/", "  M  tracked.ts", "?? new.ts"])
    expect(options.map((option) => option.name).join(" ")).not.toMatch(/[●○◐]/)
    expect(gitStatusColor("M", true)).toBe(COLORS.success)
    expect(gitStatusColor("M", false)).toBe(COLORS.warning)
    expect(gitStatusColor("?", true)).toBe(COLORS.warning)
    expect(gitStatusColor("D", false)).toBe(COLORS.danger)
    expect(gitStatusColor("R", true)).toBe(COLORS.database)
  })

  test("keeps the selected file inside the visible tree window", () => {
    const options = createFileTreeOptions(
      Array.from({ length: 20 }, (_, index) => ({
        path: `file-${index.toString().padStart(2, "0")}.ts`,
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        unstaged: true,
        untracked: true,
      })),
      new Set(),
    )
    expect(gitFileTreeVisibleWindow(options, 0, 5).start).toBe(0)
    expect(gitFileTreeVisibleWindow(options, 10, 5).start).toBe(8)
    expect(gitFileTreeVisibleWindow(options, 19, 5).start).toBe(15)
  })

  test("renders single-child folders on separate lines as one navigable block", () => {
    const options = createFileTreeOptions(
      [
        {
          path: "usr/outra-pasta/mais-uma/outra/arquivo.js",
          indexStatus: " ",
          worktreeStatus: "M",
          staged: false,
          unstaged: true,
          untracked: false,
        },
      ],
      new Set(),
    )
    expect(options.map((option) => option.name)).toEqual(["▾ usr/", "   M arquivo.js"])
    expect(options.map((option) => option.depth)).toEqual([0, 1])
    expect(options[0]?.path).toBe("usr/outra-pasta/mais-uma/outra")
    expect(options[0]?.folderChain).toEqual(["usr", "outra-pasta", "mais-uma", "outra"])
    const folderOption = options[0]
    if (!folderOption) throw new Error("expected the compact folder option")
    expect(gitFileTreeOptionHeight(folderOption)).toBe(4)
    expect(gitFileTreeVisibleWindow(options, 1, 5)).toEqual({ start: 0, end: 2 })

    const pathOptions = createPathTreeOptions(
      ["usr/outra-pasta/mais-uma/outra/arquivo.js"],
      new Set(),
    )
    expect(pathOptions.map((option) => option.name)).toEqual(["▾ usr/", "  arquivo.js"])
    expect(pathOptions[0]?.folderChain).toEqual(["usr", "outra-pasta", "mais-uma", "outra"])
  })
})
