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

  test("keeps the direction glyph neutral in global A/F navigation hints", () => {
    const value = "[A←] anterior  [F→] próximo"
    const result = shortcutContent(value)
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual([
      "[A",
      "[F",
    ])
    expect(result.chunks.filter((chunk) => !chunk.fg).map((chunk) => chunk.text)).toContain("←]")
    expect(result.chunks.filter((chunk) => !chunk.fg).map((chunk) => chunk.text)).toContain("→]")
  })

  test("keeps nested Z/V arrows neutral too", () => {
    const value = "[Z←] anterior  [V→] próximo"
    const result = shortcutContent(value)
    if (typeof result === "string") throw new Error("Expected styled shortcuts")
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(value)
    expect(result.chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)).toEqual([
      "[Z",
      "[V",
    ])
    expect(result.chunks.filter((chunk) => !chunk.fg).map((chunk) => chunk.text)).toContain("←]")
    expect(result.chunks.filter((chunk) => !chunk.fg).map((chunk) => chunk.text)).toContain("→]")
  })

  test("does not allocate styled text for ordinary text or incomplete hints", () => {
    for (const value of ["", "texto normal", "[Ctrl+", "[]", "[Enter\n]"]) {
      expect(shortcutContent(value)).toBe(value)
    }
  })
})
