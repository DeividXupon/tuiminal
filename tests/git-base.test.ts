import { describe, expect, test } from "bun:test"
import { parsePatch } from "diff"
import { COLORS } from "../src/core/settings/theme"
import {
  compactGitActionFooter,
  gitActionLabel,
  gitPaneFocusTarget,
} from "../src/features/git/GitWorkspace"
import { createFileTreeOptions } from "../src/features/git/rendering/file-tree"
import { trimGitPatchTerminator } from "../src/features/git/services/git"
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
})

describe("Git action footer", () => {
  test("uses compact controls when the preview pane cannot fit full labels", () => {
    expect(compactGitActionFooter(39)).toBe(true)
    expect(compactGitActionFooter(57)).toBe(true)
    expect(compactGitActionFooter(58)).toBe(false)
  })

  test("keeps every compact control as a complete bracketed shortcut", () => {
    expect(gitActionLabel(true, "[␠] Stage")).toBe("[␠]")
    expect(gitActionLabel(true, "[R] Sync")).toBe("[R]")
    expect(gitActionLabel(false, "[R] Sync")).toBe("[R] Sync")
  })

  test("moves between the file tree and diff without reserving L for the log", () => {
    expect(gitPaneFocusTarget("tab", true, false)).toBe("preview")
    expect(gitPaneFocusTarget("l", true, false)).toBe("preview")
    expect(gitPaneFocusTarget("right", true, false)).toBe("preview")
    expect(gitPaneFocusTarget("h", false, true)).toBe("files")
    expect(gitPaneFocusTarget("left", false, true)).toBe("files")
    expect(gitPaneFocusTarget("o", true, false)).toBeNull()
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
})
