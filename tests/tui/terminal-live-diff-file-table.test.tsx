import "./setup"
import { afterEach, expect, test } from "bun:test"
import { type BoxRenderable, RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { act } from "react"
import type { LiveDiffFile } from "../../packages/feature-terminal/src/model/live-diff"
import { LiveDiffFileTable } from "../../packages/feature-terminal/src/ui/LiveDiffFileTable"

const originalStaticLoaders = process.env.TUIMINAL_TEST_STATIC_LOADERS
let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (originalStaticLoaders === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
  else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStaticLoaders
})

test("Live Diff fades every changed file row back to its normal background in two seconds", async () => {
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  const highlightedAt = Date.now()
  const files: LiveDiffFile[] = ["first.ts", "second.ts"].map((path) => ({
    root: "/fixture/project",
    path,
    additions: 1,
    deletions: 0,
    fingerprint: path,
    untracked: false,
    newFile: false,
    headExists: true,
    changedAt: highlightedAt,
    listHighlightAt: highlightedAt,
  }))
  tui = await testRender(
    <LiveDiffFileTable
      sessionId="fade"
      files={files}
      selected={files[0] ?? null}
      now={highlightedAt}
      error=""
      active
      onSelect={() => undefined}
      onFocus={() => undefined}
      height={5}
    />,
    { width: 80, height: 6 },
  )
  await tui.renderOnce()

  const first = tui.renderer.root.findDescendantById("live-diff-file-fade-0") as BoxRenderable
  const second = tui.renderer.root.findDescendantById("live-diff-file-fade-1") as BoxRenderable
  expect(first.backgroundColor.equals(RGBA.fromHex(COLORS.panelRaised))).toBe(false)
  expect(second.backgroundColor.equals(RGBA.fromHex(COLORS.canvas))).toBe(false)

  await act(async () => Bun.sleep(2050))
  await tui.renderOnce()
  expect(first.backgroundColor.equals(RGBA.fromHex(COLORS.panelRaised))).toBe(true)
  expect(second.backgroundColor.equals(RGBA.fromHex(COLORS.canvas))).toBe(true)
})
