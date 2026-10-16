import "./setup"
import { afterEach, expect, test } from "bun:test"
import { CodeRenderable, type Renderable, RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { NativeDiff } from "../../packages/core/src/ui/NativeDiff"
import { syntaxFiletype } from "../../packages/core/src/syntax/index"
import { parseDiffDocuments } from "../../packages/feature-git/src/rendering/diff"
import { GitDiffDocument } from "../../packages/feature-git/src/ui/shared/GitDiffDocument"

const initialSettings = getUiSettings()
let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

function codeCells(root: Renderable): CodeRenderable[] {
  return root
    .getChildren()
    .flatMap((child) => (child instanceof CodeRenderable ? [child] : codeCells(child)))
}

function currentTui() {
  if (!tui) throw new Error("Diff fixture is not mounted")
  return tui
}

async function settle() {
  await act(async () => {
    await currentTui().renderOnce()
    await Promise.all(codeCells(currentTui().renderer.root).map((cell) => cell.highlightingDone))
    await currentTui().renderOnce()
  })
}

function patch(path: string, oldLine: string, newLine: string) {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${oldLine}\n+${newLine}\n`
}

function coloredSpan(text: string, foreground: string) {
  const spans = currentTui()
    .captureSpans()
    .lines.flatMap((line) => line.spans)
  const color = RGBA.fromHex(foreground).toInts()
  const span = spans.find(
    (span) =>
      span.text.includes(text) &&
      span.fg.toInts().every((channel, index) => channel === color[index]),
  )
  expect(span).toBeDefined()
  if (!span) throw new Error(`Missing ${text} in color ${foreground}`)
  return span
}

test.each(["unified", "split", "inline"] as const)(
  "Git %s colors Python keywords and Unicode strings",
  async (layout) => {
    updateUiSettings({ colorMode: "dark" })
    const source = patch("example.py", 'return "old"', 'return "café 🦊"')
    const document = parseDiffDocuments(source)[0]
    if (!document) throw new Error("Missing Python diff document")
    tui = await testRender(<GitDiffDocument document={document} layout={layout} />, {
      width: 110,
      height: 12,
    })
    await settle()
    coloredSpan("return", "#c792ea")
    coloredSpan("café", "#c3e88d")
    expect(tui.captureCharFrame()).toContain("🦊")
  },
)

test.each(["dark", "light"] as const)(
  "Live Diff surface keeps syntax and recent-line backgrounds in %s mode",
  async (colorMode) => {
    updateUiSettings({ colorMode })
    tui = await testRender(
      <NativeDiff
        patch={patch("example.py", 'return "old"', 'return "new"')}
        filetype={syntaxFiletype("example.py")}
        height={8}
        lineColors={
          new Map([[1, { gutter: COLORS.diffModifiedBg, content: COLORS.diffModifiedBg }]])
        }
      />,
      { width: 90, height: 12 },
    )
    await settle()
    coloredSpan("return", colorMode === "dark" ? "#c792ea" : "#6f42c1")
    const added = coloredSpan("new", colorMode === "dark" ? "#c3e88d" : "#2f7d32")
    expect(added.bg.toInts()).toEqual(RGBA.fromHex(COLORS.diffModifiedBg).toInts())
  },
)

test.each([
  ["settings.yaml", 'message: "old"', 'message: "hello"', "hello", "#c3e88d"],
  ["settings.json", '{"message":"old"}', '{"message":"hello"}', "hello", "#c3e88d"],
  [
    "app.tsx",
    "const view = <span />",
    'const view = <button title="hello" />',
    "button",
    "#82aaff",
  ],
] as const)("shared diff renders %s syntax", async (path, oldLine, newLine, token, color) => {
  updateUiSettings({ colorMode: "dark" })
  tui = await testRender(
    <NativeDiff patch={patch(path, oldLine, newLine)} filetype={syntaxFiletype(path)} height={8} />,
    { width: 100, height: 12 },
  )
  await settle()
  coloredSpan(token, color)
})
