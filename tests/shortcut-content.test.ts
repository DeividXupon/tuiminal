import { describe, expect, test } from "bun:test"
import { RGBA, StyledText } from "@opentui/core"
import { BRAND_COLOR } from "../src/shared/ui/brand"
import { shortcutContent } from "../src/shared/ui/shortcut-content"

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
    const result = shortcutContent(keys.join(" "))
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual(keys)
  })

  test("does not allocate styled text for ordinary text or incomplete hints", () => {
    for (const value of ["", "texto normal", "[Ctrl+", "[]", "[Enter\n]"]) {
      expect(shortcutContent(value)).toBe(value)
    }
  })
})
