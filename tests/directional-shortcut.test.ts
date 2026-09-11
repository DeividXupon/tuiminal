import { describe, expect, test } from "bun:test"
import {
  directionalShortcutDirection,
  directionalShortcutLabel,
} from "../src/shared/ui/directional-shortcut"

describe("global directional shortcuts", () => {
  test("maps only plain A/F and exposes their semantic arrows", () => {
    expect(directionalShortcutDirection({ name: "a" })).toBe(-1)
    expect(directionalShortcutDirection({ name: "F" })).toBe(1)
    expect(directionalShortcutDirection({ name: "a", shift: true })).toBeNull()
    expect(directionalShortcutDirection({ name: "f", ctrl: true })).toBeNull()
    expect(directionalShortcutDirection({ name: ">" })).toBeNull()
    expect(directionalShortcutLabel(-1)).toBe("[A←]")
    expect(directionalShortcutLabel(1)).toBe("[F→]")
  })

  test("uses plain Z/V for a nested horizontal option strip", () => {
    expect(directionalShortcutDirection({ name: "z" }, "nested")).toBe(-1)
    expect(directionalShortcutDirection({ name: "V" }, "nested")).toBe(1)
    expect(directionalShortcutDirection({ name: "v", shift: true }, "nested")).toBeNull()
    expect(directionalShortcutDirection({ name: "a" }, "nested")).toBeNull()
    expect(directionalShortcutLabel(-1, "nested")).toBe("[Z←]")
    expect(directionalShortcutLabel(1, "nested")).toBe("[V→]")
  })
})
