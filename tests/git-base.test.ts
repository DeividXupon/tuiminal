import { describe, expect, test } from "bun:test"
import { parsePatch } from "diff"
import { trimGitPatchTerminator } from "../src/features/git/services/git"
import { compactGitActionFooter, gitActionLabel } from "../src/features/git/GitWorkspace"

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
})
