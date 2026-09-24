import { RGBA } from "@opentui/core"

export type TextShimmerAnimation = {
  frame: number
  frameCount: number
  shineColor: string
}

export function blendTextColor(from: RGBA, to: RGBA, ratio: number) {
  const start = from.toInts()
  const end = to.toInts()
  const amount = Math.max(0, Math.min(1, ratio))
  return RGBA.fromInts(
    Math.round(start[0] + (end[0] - start[0]) * amount),
    Math.round(start[1] + (end[1] - start[1]) * amount),
    Math.round(start[2] + (end[2] - start[2]) * amount),
  )
}

/** Smooth traveling highlight shared by Free Terminal shortcut and diff glyphs. */
export function textShimmerIntensity(
  position: number,
  length: number,
  animation: TextShimmerAnimation,
) {
  const progress =
    (Math.max(0, animation.frame) % Math.max(1, animation.frameCount)) /
    Math.max(1, animation.frameCount - 1)
  const band = -1.5 + progress * (Math.max(0, length) + 3)
  const proximity = Math.max(0, 1 - Math.abs(position - band) / 1.75)
  return proximity * proximity * (3 - 2 * proximity) * 0.78
}
