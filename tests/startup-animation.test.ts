import { describe, expect, test } from "bun:test"
import {
  createStartupAnimationFrame,
  STARTUP_ANIMATION_TIMING,
  STARTUP_BLOCK_DROP_ORDER,
  STARTUP_WORDMARK,
} from "../apps/cli/src/model/startup-animation"

describe("startup animation", () => {
  test("drops the four logo blocks one after another", () => {
    for (let index = 0; index < STARTUP_ANIMATION_TIMING.blockStarts.length; index += 1) {
      const elapsed = (STARTUP_ANIMATION_TIMING.blockStarts[index] ?? 0) + 1
      const frame = createStartupAnimationFrame(elapsed, 100, 30)
      const visible = new Set(
        frame.blocks.filter((block) => block.visible).map((block) => block.id),
      )
      expect(visible.size).toBe(index + 1)
      for (const id of STARTUP_BLOCK_DROP_ORDER.slice(0, index + 1))
        expect(visible.has(id)).toBe(true)
    }

    const settled = createStartupAnimationFrame(STARTUP_ANIMATION_TIMING.wordStart, 100, 30)
    expect(settled.blocks.every((block) => block.settled)).toBe(true)
    expect(STARTUP_BLOCK_DROP_ORDER).toEqual(["rightBottom", "rightTop", "left", "top"])
  })

  test("reveals the wordmark only after the logo is assembled and then exits", () => {
    const beforeWord = createStartupAnimationFrame(STARTUP_ANIMATION_TIMING.wordStart - 1, 100, 30)
    const wordReady = createStartupAnimationFrame(
      STARTUP_ANIMATION_TIMING.wordStart + STARTUP_ANIMATION_TIMING.wordDuration,
      100,
      30,
    )
    const exiting = createStartupAnimationFrame(
      STARTUP_ANIMATION_TIMING.exitStart + STARTUP_ANIMATION_TIMING.exitDuration / 2,
      100,
      30,
    )
    const complete = createStartupAnimationFrame(STARTUP_ANIMATION_TIMING.total, 100, 30)

    expect(beforeWord.word).toBe("")
    expect(wordReady.word).toBe(STARTUP_WORDMARK)
    expect(exiting.opacity).toBeCloseTo(0.25)
    expect(complete.opacity).toBe(0)
    expect(complete.complete).toBe(true)
  })

  test("uses compact layouts without moving the mark outside the terminal", () => {
    for (const [width, height] of [
      [40, 16],
      [18, 9],
    ] as const) {
      const frame = createStartupAnimationFrame(STARTUP_ANIMATION_TIMING.wordStart, width, height)
      expect(frame.compact).toBe(true)
      for (const block of frame.blocks) {
        expect(block.left).toBeGreaterThanOrEqual(0)
        expect(block.left + block.width).toBeLessThanOrEqual(width)
        expect(block.top).toBeGreaterThanOrEqual(0)
        expect(block.top + block.height).toBeLessThanOrEqual(height)
      }
    }
  })
})
