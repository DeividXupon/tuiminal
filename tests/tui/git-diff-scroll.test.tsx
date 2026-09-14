import "./setup"
import { afterEach, expect, test } from "bun:test"
import { CodeRenderable, type Renderable, RGBA, type ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, useEffect, useRef, useState } from "react"
import {
  COLORS,
  getUiSettings,
  panelBorder,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import type { DiffLayout } from "../../packages/feature-git/src/model/view"
import { parseDiffDocuments } from "../../packages/feature-git/src/rendering/diff"
import { handleGitDiffHorizontalKey } from "../../packages/feature-git/src/rendering/diff-scroll"
import { GitDiffDocument } from "../../packages/feature-git/src/ui/shared/GitDiffDocument"
import { GitDiffViewport } from "../../packages/feature-git/src/ui/shared/GitDiffViewport"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"

const settings = getUiSettings()
let tui: TestRendererSetup | undefined
const patch = [
  "diff --git a/wide.ts b/wide.ts",
  "--- a/wide.ts",
  "+++ b/wide.ts",
  "@@ -1000,3 +1000,3 @@",
  `-const oldValue = "${"中文\twide".repeat(35)}OLD-END";`,
  `+const newValue = "${"中文\twide".repeat(35)}NEW-END";`,
  " context",
  " finalContext",
].join("\n")
const document = parseDiffDocuments(patch)[0]

function Harness({ initialLayout = "unified" }: { initialLayout?: DiffLayout }) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [layout, setLayout] = useState(initialLayout)
  useEffect(() => {
    scrollRef.current?.focus()
  }, [])
  useKeyboard((key) => {
    if (handleGitDiffHorizontalKey(key, scrollRef.current?.focused ?? false, scrollRef.current))
      return
    if (key.name === "v") setLayout((current) => (current === "unified" ? "split" : "inline"))
  })
  return (
    <box style={{ flexGrow: 1, minHeight: 0, ...panelBorder() }}>
      <GitDiffViewport id="test-diff" scrollRef={scrollRef} resetKey={layout}>
        {document && <GitDiffDocument document={document} layout={layout} />}
      </GitDiffViewport>
      <InlineButton id="outside-diff" label="[T] Terminal" onPress={() => {}} />
    </box>
  )
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function cells(root: Renderable): CodeRenderable[] {
  return root
    .getChildren()
    .flatMap((child) => (child instanceof CodeRenderable ? [child] : cells(child)))
}

function viewport() {
  return tui?.renderer.root.findDescendantById("test-diff") as ScrollBoxRenderable
}

async function settle() {
  await act(async () => {
    await tui?.renderOnce()
    await tui?.renderOnce()
  })
}

async function key(name: string, shift = false) {
  act(() => tui?.mockInput.pressKey(name, { shift }))
  await settle()
}

async function end() {
  for (let index = 0; index < 100; index += 1) await key("l", true)
}

async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
  })
  await settle()
}

function expectColor(text: string, color: string) {
  const span = tui
    ?.captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((span) => span.text.includes(text))
  expect(span).toBeDefined()
  expect(span?.bg.toInts()).toEqual(RGBA.fromHex(color).toInts())
}

test.each(["compact", "framed"] as const)(
  "%s diff reaches unicode/tab suffixes and keeps change backgrounds",
  async (layout) => {
    updateUiSettings({ layout, language: "pt-BR" })
    tui = await testRender(<Harness />, { width: 94, height: 14 })
    await settle()
    expect(tui.captureCharFrame()).toContain("oldValue")
    expect(tui.captureCharFrame()).toContain("newValue")
    await end()
    expect(tui.captureCharFrame()).toContain('OLD-END";')
    expect(tui.captureCharFrame()).toContain('NEW-END";')
    expectColor("OLD-END", COLORS.diffRemovedBg)
    expectColor("NEW-END", COLORS.diffAddedBg)
    expect(tui.captureCharFrame()).toContain("1000 -")
    expect(tui.captureCharFrame()).toContain("1000 +")
    expect(tui.captureCharFrame()).toContain("[Shift+H/←]")
    expect(tui.captureCharFrame()).toContain("[Shift+L/→]")

    await click("outside-diff")
    expect(cells(viewport()).every((cell) => cell.scrollX === 0)).toBe(true)
    await click("test-diff-scroll-right")
    expect(cells(viewport())[0]?.scrollX).toBe(8)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("test-diff")
    await click("test-diff-scroll-left")
    expect(cells(viewport())[0]?.scrollX).toBe(0)
  },
)

test.each(["compact", "framed"] as const)(
  "%s split keeps both columns visible and scrolls them together",
  async (layout) => {
    updateUiSettings({ layout, language: "pt-BR" })
    tui = await testRender(<Harness />, { width: 94, height: 14 })
    await settle()
    await key("l", true)
    await key("v")
    const code = cells(viewport())
    expect(code).toHaveLength(2)
    expect(code.every((cell) => cell.scrollX === 0)).toBe(true)
    expect(tui.captureCharFrame()).toContain("oldValue")
    expect(tui.captureCharFrame()).toContain("newValue")
    expect(viewport().scrollWidth).toBe(viewport().viewport.width)
    const bounds = code.map((cell) => [cell.screenX, cell.width])
    await key("l", true)
    expect(code.map((cell) => cell.scrollX)).toEqual([8, 8])
    const right = code[1]
    if (!right) throw new Error("Missing right code pane")
    await act(async () => {
      await tui?.mockMouse.scroll(right.screenX + 1, right.screenY, "right")
    })
    await settle()
    expect(code[0]?.scrollX).toBeGreaterThan(8)
    expect(code[0]?.scrollX).toBe(code[1]?.scrollX)
    await end()
    expect(code.map((cell) => [cell.screenX, cell.width])).toEqual(bounds)
    const row = tui
      .captureCharFrame()
      .split("\n")
      .find((line) => line.includes('OLD-END";'))
    expect(row).toContain('NEW-END";')
    expectColor("OLD-END", COLORS.diffRemovedBg)
    expectColor("NEW-END", COLORS.diffAddedBg)

    act(() => tui?.resize(70, 12))
    await settle()
    await end()
    expect(tui.captureCharFrame()).toContain('OLD-END";')
    expect(tui.captureCharFrame()).toContain('NEW-END";')
    expect(viewport().scrollWidth).toBe(viewport().viewport.width)
    await click("outside-diff")
    expect(code.every((cell) => cell.scrollX === 0)).toBe(true)
  },
)

test("intraline content scrolls without moving its gutter or hiding the final row", async () => {
  tui = await testRender(<Harness initialLayout="inline" />, { width: 86, height: 7 })
  await settle()
  await end()
  expect(tui.captureCharFrame()).toContain('NEW-END";')
  expect(tui.captureCharFrame()).toContain("1000 ~")
  act(() => viewport().scrollTo(1000))
  await settle()
  const controls = tui.renderer.root.findDescendantById("test-diff-scroll-controls")
  if (!controls) throw new Error("Missing scroll controls")
  expect(viewport().viewport.screenY + viewport().viewport.height).toBe(controls.screenY)
  await click("outside-diff")
  expect(tui.captureCharFrame()).toContain("finalContext")
})

test.each(["unified", "split", "inline"] as const)(
  "%s diff accepts both shifted key pairs without leaving the focused viewport",
  async (layout) => {
    tui = await testRender(<Harness initialLayout={layout} />, { width: 94, height: 14 })
    await settle()
    const code = cells(viewport())
    expect(code.some((cell) => cell.maxScrollX >= 16)).toBe(true)
    for (const [name, expected] of [
      ["ARROW_RIGHT", 8],
      ["l", 16],
      ["ARROW_LEFT", 8],
      ["h", 0],
    ] as const) {
      await key(name, true)
      expect(code.map((cell) => cell.scrollX)).toEqual(
        code.map((cell) => Math.min(expected, cell.maxScrollX)),
      )
      expect(tui.renderer.currentFocusedRenderable).toBe(viewport())
    }
    await click("outside-diff")
    await key("ARROW_RIGHT", true)
    await key("l", true)
    expect(code.every((cell) => cell.scrollX === 0)).toBe(true)
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("outside-diff")
  },
)
