import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { parseDiffDocuments } from "../../packages/feature-git/src/rendering/diff"
import { GitDiffDocument } from "../../packages/feature-git/src/ui/shared/GitDiffDocument"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test.each(["unified", "split", "inline"] as const)(
  "%s shows header-like code through the last context line",
  async (layout) => {
    const patch = [
      "diff --git a/example.txt b/example.txt",
      "--- a/example.txt",
      "+++ b/example.txt",
      "@@ -1,3 +1,3 @@",
      "--- old section",
      "---tail",
      "+++ new section",
      "+++tail",
      " stable-last-line",
    ].join("\n")
    const document = parseDiffDocuments(patch)[0]
    if (!document) throw new Error("Missing diff document")
    tui = await testRender(<GitDiffDocument document={document} layout={layout} />, {
      width: 100,
      height: 16,
    })
    await act(async () => Bun.sleep(20))
    await tui.renderOnce()
    const frame = tui.captureCharFrame()
    expect(frame).toContain("++ new section")
    expect(frame).toContain("++tail")
    expect(frame).toContain("stable-last-line")
    if (layout !== "inline") {
      expect(frame).toContain("-- old section")
      expect(frame).toContain("--tail")
    }
  },
)
