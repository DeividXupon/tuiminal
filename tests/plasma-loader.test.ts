import { describe, expect, test } from "bun:test"
import { StyledText } from "@opentui/core"
import {
  createPlasmaFrame,
  plasmaExitPresence,
  plasmaStyledText,
} from "../src/shared/ui/plasma-loader"

describe("plasma loading surface", () => {
  test("fills the requested terminal area with one bounded text document", () => {
    const frame = createPlasmaFrame(24, 6, 0)
    const plainText = frame.runs.map((run) => run.text).join("")

    expect(frame.width).toBe(24)
    expect(frame.height).toBe(6)
    expect(plainText.split("\n")).toHaveLength(6)
    expect(plainText.split("\n").every((line) => line.length === 24)).toBe(true)
    expect(frame.runs.length).toBeLessThan(24 * 6)
  })

  test("moves over time and dissolves into spaces during exit", () => {
    const first = createPlasmaFrame(30, 8, 0)
    const next = createPlasmaFrame(30, 8, 5)
    const gone = createPlasmaFrame(30, 8, 5, 0)
    const text = (frame: typeof first) => frame.runs.map((run) => run.text).join("")

    expect(text(next)).not.toBe(text(first))
    expect(text(gone).replaceAll("\n", "").trim()).toBe("")
    expect(plasmaExitPresence(0)).toBe(1)
    expect(plasmaExitPresence(110)).toBeCloseTo(0.25)
    expect(plasmaExitPresence(220)).toBe(0)
  })

  test("styles contiguous tones without creating one React node per cell", () => {
    const frame = createPlasmaFrame(28, 7, 3)
    const styled = plasmaStyledText(frame, "#f7c873", "#0f141c")

    expect(styled).toBeInstanceOf(StyledText)
    expect(styled.chunks).toHaveLength(frame.runs.length)
    expect(styled.chunks.every((chunk) => chunk.fg && chunk.bg)).toBe(true)
  })
})
