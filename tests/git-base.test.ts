import { describe, expect, test } from "bun:test"
import { parsePatch } from "diff"
import { COLORS } from "../src/core/settings/theme"
import {
  compactGitActionFooter,
  gitActionLabel,
  gitPaneFocusTarget,
} from "../src/features/git/model/base-navigation"
import {
  displayGitCommand,
  optimisticGitDiscard,
  optimisticGitStage,
  parseGitCommandInput,
} from "../src/features/git/model/git-command-console"
import {
  createFileTreeOptions,
  createPathTreeOptions,
} from "../src/features/git/rendering/file-tree"
import {
  GitCommandBudgetError,
  runGitCommand,
  trimGitPatchTerminator,
} from "../src/features/git/services/git"
import { gitFileTreeWindowStart, gitStatusColor } from "../src/features/git/ui/base/GitFileTree"

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
})

describe("Git command console", () => {
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
    expect(gitFileTreeWindowStart(0, 20, 5)).toBe(0)
    expect(gitFileTreeWindowStart(10, 20, 5)).toBe(8)
    expect(gitFileTreeWindowStart(19, 20, 5)).toBe(15)
  })

  test("compacts single-child folder chains into one navigable row", () => {
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
    expect(options.map((option) => option.name)).toEqual([
      "▾ usr/outra-pasta/mais-uma/outra/",
      "   M arquivo.js",
    ])
    expect(options.map((option) => option.depth)).toEqual([0, 1])
    expect(options[0]?.path).toBe("usr/outra-pasta/mais-uma/outra")
    expect(
      createPathTreeOptions(["usr/outra-pasta/mais-uma/outra/arquivo.js"], new Set()).map(
        (option) => option.name,
      ),
    ).toEqual(["▾ usr/outra-pasta/mais-uma/outra/", "  arquivo.js"])
  })
})
