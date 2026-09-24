import { expect, test } from "bun:test"
import { type CodeRenderable, type OptimizedBuffer, RGBA } from "@opentui/core"
import {
  blendTextColor,
  type TextShimmerAnimation,
  textShimmerIntensity,
} from "../packages/core/src/ui/text-shimmer"
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

function expectedColor(position: number, animation: TextShimmerAnimation) {
  return blendTextColor(
    RGBA.fromHex("#dddddd"),
    RGBA.fromHex(animation.shineColor),
    textShimmerIntensity(position, code.width, animation),
  ).toInts()
}

test("Live Diff uses the shortcut shimmer curve on changed text, including wrapped rows", () => {
  const background = RGBA.fromHex("#344b70")
  const { buffer, draws } = capturedBuffer(background)
  const first = { frame: 5, frameCount: 28, shineColor: "#ffffff" }
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), first)
  expect(draws.some((draw) => draw.y === 0)).toBe(false)
  expect(draws.find((draw) => draw.y === 1 && draw.x === 3)?.color.toInts()).toEqual(
    expectedColor(3, first),
  )
  expect(draws.find((draw) => draw.y === 2 && draw.x === 3)?.color.toInts()).toEqual(
    expectedColor(3, first),
  )
  expect(
    new Set(draws.filter((draw) => draw.y === 1).map((draw) => draw.color.toInts().join())).size,
  ).toBeGreaterThan(2)

  draws.length = 0
  const second = { ...first, frame: 17 }
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), second)
  expect(draws.find((draw) => draw.y === 1 && draw.x === 13)?.color.toInts()).toEqual(
    expectedColor(13, second),
  )
  expect(draws.some((draw) => draw.y === 1 && draw.x === 3)).toBe(false)
})

test("Live Diff shimmer follows the palette-aware shortcut target color", () => {
  const background = RGBA.fromHex("#bed3f4")
  const { buffer, draws } = capturedBuffer(background)
  const animation = { frame: 5, frameCount: 28, shineColor: "#172b56" }
  drawLiveDiffTextShimmer(buffer, code, new Set([1]), animation)
  expect(draws.find((draw) => draw.y === 1 && draw.x === 3)?.color.toInts()).toEqual(
    expectedColor(3, animation),
  )
})
