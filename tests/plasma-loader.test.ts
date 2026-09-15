import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { StyledText } from "@opentui/core"
import {
  createPlasmaFrame,
  plasmaExitPresence,
  plasmaStyledText,
} from "../packages/core/src/ui/plasma-loader"

describe("plasma loading surface", () => {
  test.each([
    [[24, 6, 0, 1], "613e01ce0f77eceb6645c7c9e22fed4a741cf7c2b6343c7ae55f2d4240b3981d"],
    [[80, 24, 50, 1], "1d2feacb32f680f0860810028e78a3571e02edfdfb48f02b96407e12d6fce5bb"],
    [[320, 100, 10, 0.5], "e23f1b1c18262d120abbb6e452abe33d6a8f528d09f1fbab40615c36b97c2073"],
    [[37, 9, 123, 0.25], "6f3b1df0d0075a4a6168dff4e682e65290efa23300367177b896a8a97f750801"],
    [[320, 100, 300, 1], "d3e7d557ea3f36c100d7e2b1099672bc8043eccf03c3dc62b3bd9e84a16b7759"],
    [[640, 200, 123, 0], "e58b02048e7f4b76b06604db1a4057a93539667be8fb9cb685652b249464bfa3"],
  ] as const)("preserves the original characters and tones for frame %j", (args, expected) => {
    // Golden frames from the original per-cell formula, including capped dimensions and fades.
    const frame = createPlasmaFrame(args[0], args[1], args[2], args[3])
    expect(createHash("sha256").update(JSON.stringify(frame)).digest("hex")).toBe(expected)
  })

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
