import { describe, expect, test } from "bun:test"
import { RGBA, StyledText } from "@opentui/core"
import { ACTION_KEY_COLOR, BRAND_COLOR } from "../packages/core/src/ui/brand"
import { shortcutContent } from "../packages/core/src/ui/shortcut-content"

describe("shortcut accent", () => {
  test("colors only bracketed keys, preserving labels and spacing", () => {
    const value = "  [x] Fechar · Salvar [Ctrl+S]  "
    const result = shortcutContent(value)
    expect(result).toBeInstanceOf(StyledText)
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual([
      "[x]",
      "[Ctrl+S]",
    ])
    for (const chunk of result.chunks) {
      if (chunk.fg) expect(chunk.fg.toInts()).toEqual(RGBA.fromHex("#4B75FF").toInts())
      else expect(Object.hasOwn(chunk, "fg")).toBe(false)
      expect(Object.hasOwn(chunk, "bg")).toBe(false)
    }
    expect(BRAND_COLOR).toBe("#4B75FF")
  })

  test("handles Vim keys, arrows, symbols, ranges and literal brackets", () => {
    const keys = ["[H/←]", "[↑/↓/J/K]", "[+ ]", "[@ # $ % ^]", "[1–4]", "[dd]", "[[]", "[]]"]
    const value = `${keys.join(" ")} · [[]/[]] troca aba`
    const result = shortcutContent(value)
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual([
      ...keys,
      "[[]",
      "[]]",
    ])
  })

  test("colors the complete hint, including arrows, action keys and selected/disabled overrides", () => {
    const value = "[A←] [F→] [Z←] [V→] [?] [Ctrl+B]"
    const result = shortcutContent(value, "#777777", undefined, ["[Ctrl+B]"])
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual(
      value.split(" "),
    )
    for (const chunk of result.chunks.filter((chunk) => chunk.fg))
      expect(chunk.fg?.toInts()).toEqual(
        RGBA.fromHex(
          chunk.text === "[?]" || chunk.text === "[Ctrl+B]" ? ACTION_KEY_COLOR : BRAND_COLOR,
        ).toInts(),
      )
  })

  test("animates complete keys over their base colors without changing labels or spacing", () => {
    const value = "  [Ctrl+B] ação [A←] [?] [[] []]  "
    const frameColors = (frame: number) => {
      const result = shortcutContent(
        value,
        "#777777",
        { frame, frameCount: 28, shineColor: "#ffffff" },
        ["[Ctrl+B]"],
      )
      if (typeof result === "string") throw new Error("Expected animated shortcuts")
      expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
      expect(result.chunks.filter((chunk) => !chunk.fg).map((chunk) => chunk.text)).toEqual([
        "  ",
        " ação ",
        " ",
        " ",
        " ",
        "  ",
      ])
      return result.chunks.flatMap((chunk) => (chunk.fg ? [chunk.fg.toInts()] : []))
    }
    const first = frameColors(0)
    const middle = frameColors(10)
    const last = frameColors(18)
    expect(first.at(-1)).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
    expect(middle).not.toEqual(first)
    expect(last).not.toEqual(middle)
    expect(new Set(middle.map((color) => color.join(","))).size).toBeGreaterThan(2)
  })

  test("does not allocate styled text for ordinary text or incomplete hints", () => {
    for (const value of ["", "texto normal", "[Ctrl+", "[]", "[Enter\n]"]) {
      expect(shortcutContent(value)).toBe(value)
    }
  })
})
