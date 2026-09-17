import { expect, test } from "bun:test"
import { FEATURE_IDS } from "../apps/cli/src/features/model"
import {
  FEATURE_PRESENTATIONS,
  FEATURE_PREVIEW_STEPS,
  featurePreviewFrame,
} from "../apps/cli/src/features/presentation"
import { FEATURE_MESSAGES } from "../packages/core/src/i18n/features-catalog"
import { translateUi, displayWidth } from "../packages/core/src/i18n/index"

for (const id of FEATURE_IDS) {
  test(`${id} has a localized description and a bounded, looping animated icon in both sizes`, () => {
    const description = FEATURE_PRESENTATIONS[id].description
    const message = FEATURE_MESSAGES.find((entry) => entry[0] === description)
    expect(message).toBeDefined()
    for (const [index, language] of (
      ["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const
    ).entries()) {
      expect(translateUi(description, language)).toBe(message![index]!)
    }
    for (const compact of [true, false]) {
      const frames = Array.from({ length: FEATURE_PREVIEW_STEPS }, (_, step) =>
        featurePreviewFrame(id, step, compact),
      )
      expect(new Set(frames).size).toBeGreaterThan(2)
      for (const frame of frames) {
        expect(frame.split("\n")).toHaveLength(compact ? 2 : 9)
        expect(frame).not.toContain("undefined")
        for (const line of frame.split("\n")) expect(displayWidth(line)).toBeLessThanOrEqual(29)
      }
      expect(featurePreviewFrame(id, FEATURE_PREVIEW_STEPS, compact)).toBe(frames[0]!)
    }
  })
}

test("each tool has a distinct recognizable icon without commands or sample records", () => {
  for (const compact of [true, false]) {
    const frames = FEATURE_IDS.map((id) => featurePreviewFrame(id, 10, compact))
    expect(new Set(frames).size).toBe(FEATURE_IDS.length)
    for (const frame of frames) expect(frame).not.toMatch(/[a-zA-Z0-9]/)
  }
})

test("Database stores data inside its cylinder from the bottom up", () => {
  const empty = featurePreviewFrame("database", 0, false).split("\n")
  const partial = featurePreviewFrame("database", 12, false).split("\n")
  const full = featurePreviewFrame("database", 30, false).split("\n")
  const draining = featurePreviewFrame("database", 42, false)
  expect(empty.join("\n")).not.toContain("■")
  expect(partial[7]!.match(/■/g)).toHaveLength(4)
  expect(partial[3]).not.toContain("■")
  expect(full.join("\n").match(/■/g)).toHaveLength(12)
  expect(draining.match(/■/g)).toHaveLength(6)
  for (const row of [0, 1, 2, 4, 6, 8]) expect(full[row]).toBe(empty[row])
})

test("Runner advances execution before switching from play to completion", () => {
  const ready = featurePreviewFrame("runner", 0, false)
  const running = featurePreviewFrame("runner", 18, false)
  const complete = featurePreviewFrame("runner", 32, false)
  expect(ready).toContain("▸")
  expect(ready).not.toContain("━")
  expect(running).toContain("━━━━━━───────")
  expect(running).toContain("▸")
  expect(complete).not.toContain("▸")
  expect(complete).toContain("━━━━━━━━━━━━━")
  expect(featurePreviewFrame("runner", 32, true)).toContain("✓")
  expect(featurePreviewFrame("runner", 42, false)).toBe(ready)
})

test("HTTP sends rightward before returning leftward and acknowledging the client", () => {
  const requestStart = featurePreviewFrame("http", 0, false).split("\n")
  const requestEnd = featurePreviewFrame("http", 18, false).split("\n")
  const replyStart = featurePreviewFrame("http", 24, false).split("\n")
  const replyEnd = featurePreviewFrame("http", 42, false).split("\n")
  expect(requestStart[3]!.indexOf("→")).toBeLessThan(requestEnd[3]!.indexOf("→"))
  expect(requestEnd[5]).not.toContain("←")
  expect(replyStart[5]!.indexOf("←")).toBeGreaterThan(replyEnd[5]!.indexOf("←"))
  expect(replyStart[3]).not.toContain("✓")
  expect(replyEnd[3]).toContain("✓")
  expect(featurePreviewFrame("http", 0, true)).toContain("→")
  expect(featurePreviewFrame("http", 42, true)).toContain("←")
})
