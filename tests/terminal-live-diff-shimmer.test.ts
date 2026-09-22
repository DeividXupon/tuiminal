import { expect, test } from "bun:test"
import { type CodeRenderable, type OptimizedBuffer, RGBA } from "@opentui/core"
import { drawLiveDiffTextShimmer } from "../packages/feature-terminal/src/rendering/live-diff-shimmer"

const code = {
  lineInfo: {
    lineStartCols: [0, 0, 0],
    lineWidthCols: [16, 16, 16],
    lineWidthColsMax: 16,
    lineSources: [0, 1, 1],
    lineWraps: [0, 0, 1],
  },
  scrollY: 0,
  screenX: 0,
  screenY: 0,
  width: 20,
} as CodeRenderable

function capturedBuffer(background: RGBA) {
  const draws: Array<{ text: string; x: number; y: number; color: RGBA }> = []
  const spans = Array.from({ length: 3 }, () => [
    {
      text: "abcdefghijklmnop",
      width: 16,
      fg: RGBA.fromHex("#dddddd"),
      bg: background,
      attributes: 0,
    },
  ])
  const buffer = {
    height: 3,
    getSpanLines: () => spans.map((row) => ({ spans: row })),
    drawText: (text: string, x: number, y: number, color: RGBA) => {
      draws.push({ text, x, y, color })
    },
  } as unknown as OptimizedBuffer
  return { buffer, draws }
}

function shineColumns(draws: ReturnType<typeof capturedBuffer>["draws"], row: number, color: RGBA) {
  const target = color.toInts().join()
  return draws
    .filter((draw) => draw.y === row && draw.color.toInts().join() === target)
    .map((draw) => draw.x)
}

test("Live Diff shimmer crosses only freshly changed text, including wrapped rows", () => {
  const background = RGBA.fromHex("#344b70")
  const { buffer, draws } = capturedBuffer(background)
  const shine = RGBA.fromHex("#ffffff")
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), 6 / 26, background)
  expect(shineColumns(draws, 0, shine)).toEqual([])
  expect(shineColumns(draws, 1, shine)).toContain(3)
  expect(shineColumns(draws, 2, shine)).toContain(3)

  draws.length = 0
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), 16 / 26, background)
  expect(shineColumns(draws, 1, shine)).toContain(13)
  expect(shineColumns(draws, 1, shine)).not.toContain(3)
})

test("Live Diff shimmer uses dark text on light palette backgrounds", () => {
  const background = RGBA.fromHex("#bed3f4")
  const { buffer, draws } = capturedBuffer(background)
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), 6 / 26, background)
  expect(shineColumns(draws, 1, RGBA.fromHex("#172b56"))).toContain(3)
})
