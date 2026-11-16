import { afterEach, describe, expect, test } from "bun:test"
import {
  formatShortcutHints,
  getDefaultShortcuts,
  getToolShortcuts,
  normalizeShortcut,
  remapShortcutKey,
  setToolShortcuts,
  shortcutLabel,
  shortcutMatches,
  validateShortcuts,
} from "../packages/core/src/keyboard/bindings"
import { eventShortcut, keyForShortcut } from "../packages/core/src/keyboard/key-combination"

afterEach(() => {
  for (const tool of ["global", "http", "runner"] as const)
    setToolShortcuts(tool, getDefaultShortcuts(tool))
})

describe("physical key combinations", () => {
  test.each([
    ["[Control+OPTION+S]", "Ctrl+Alt+s"],
    ["Shift+Ctrl+F6", "Ctrl+Shift+F6"],
    ["escape", "Esc"],
    ["return", "Enter"],
    ["↑", "Up"],
    ["+", "+"],
    ["Ctrl++", "Ctrl++"],
  ])("normalizes %s to %s", (input, canonical) => {
    expect(normalizeShortcut(input)).toBe(canonical)
    expect(eventShortcut(keyForShortcut(canonical))).toBe(canonical)
  })
  test.each([
    "",
    "Ctrl+",
    "Alt+Meta+s",
    "Ctrl+Control+s",
    "Ctrl+Ctrl+s",
    "F25",
    "Hyper+s",
    "unknown",
  ])("rejects %s", (value) => {
    expect(() => normalizeShortcut(value)).toThrow()
  })
})

describe("contextual configuration", () => {
  test("accepts reused physical keys in a workspace and modal", () => {
    const result = validateShortcuts("runner", {
      workspace: { m: "F6" },
      "save-command-modal": { "Ctrl+s": "F6" },
    })
    expect(result.workspace?.m).toEqual(["F6"])
    expect(result["save-command-modal"]?.["Ctrl+s"]).toEqual(["F6"])
  })
  test("detects collisions with customized or newly added defaults", () => {
    expect(() => validateShortcuts("global", { workspace: { quit: "Alt+1" } })).toThrow("conflict")
    expect(() => validateShortcuts("runner", { workspace: { m: "F6", n: "F6" } })).toThrow(
      "conflict",
    )
    expect(() =>
      validateShortcuts("global", { workspace: { quit: ["Ctrl+x", "Control+X"] } }),
    ).toThrow("duplicate")
  })
  test("validates identities and accepts explicit disabling", () => {
    expect(() => validateShortcuts("runner", { missing: {} })).toThrow("unknown context")
    expect(() => validateShortcuts("global", { workspace: { missing: "F6" } })).toThrow(
      "unknown key",
    )
    expect(() => validateShortcuts("runner", { workspace: { Enter: "F6", return: "F7" } })).toThrow(
      "duplicate key identity",
    )
    const bindings = validateShortcuts("global", { workspace: { quit: null, escape: [] } })
    setToolShortcuts("global", bindings)
    expect(shortcutMatches("global", "workspace", "quit", { name: "q" })).toBe(false)
    expect(shortcutMatches("global", "workspace", "escape", { name: "escape" })).toBe(false)
    expect(shortcutLabel("global", "workspace", "quit")).toBe("")
  })
  test("keeps runtime state independent from caller mutations", () => {
    const bindings = validateShortcuts("global", { workspace: { quit: "F6" } })
    setToolShortcuts("global", bindings)
    bindings.workspace!.quit = []
    getToolShortcuts("global").workspace!.quit = []
    expect(shortcutMatches("global", "workspace", "quit", { name: "f6" })).toBe(true)
  })
  test("remaps only the scoped view and consumes the same physical event", () => {
    setToolShortcuts("runner", validateShortcuts("runner", { workspace: { m: "Ctrl+Alt+x" } }))
    const physical = {
      name: "x",
      ctrl: true,
      meta: true,
      raw: "raw bytes",
      sequence: "original",
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      stopPropagation() {
        this.stopped = true
      },
    }
    const mapped = remapShortcutKey("runner", "workspace", physical)
    expect(mapped.name).toBe("m")
    expect(mapped.ctrl).toBe(false)
    expect(mapped.meta).toBe(false)
    expect(physical.name).toBe("x")
    expect(physical.sequence).toBe("original")
    mapped.preventDefault()
    mapped.stopPropagation()
    expect(physical.defaultPrevented).toBe(true)
    expect(physical.stopped).toBe(true)
    expect(remapShortcutKey("runner", "workspace", { name: "m" }).name).toBe("unbound-shortcut")
    expect(remapShortcutKey("runner", "save-command-modal", { name: "m" }).name).toBe("m")
  })
  test("preserves default hint spelling and formats customized or disabled alternatives", () => {
    expect(formatShortcutHints("runner", "workspace", "[L/→] [J/K] [Ctrl+S]")).toBe(
      "[L/→] [J/K] [Ctrl+S]",
    )
    setToolShortcuts(
      "runner",
      validateShortcuts("runner", { workspace: { l: "F6", m: [], "Ctrl+s": "Ctrl+Alt+x" } }),
    )
    expect(formatShortcutHints("runner", "workspace", "[L/→] [M] [Ctrl+S]")).toBe(
      "[F6/→]  [Ctrl+Alt+X]",
    )
  })
})

test("compound hints expand modifiers and arrow pairs only after customization", () => {
  setToolShortcuts(
    "http",
    validateShortcuts("http", {
      request: { "Ctrl+j": "F6", "Ctrl+k": "F7", Up: "F8", Enter: "F9", Space: "F11" },
    }),
  )
  expect(formatShortcutHints("http", "request", "[Ctrl+J/K] [↑↓] [↵/Spc]")).toBe(
    "[F6/F7] [F8/↓] [F9/F11]",
  )
})

test("disabled or rebound plain keys cannot bypass configuration with Shift", () => {
  setToolShortcuts("runner", validateShortcuts("runner", { workspace: { j: null } }))
  expect(remapShortcutKey("runner", "workspace", { name: "j", shift: true }).name).toBe(
    "unbound-shortcut",
  )
  // Explicit Shift bindings remain distinct from their unshifted action.
  setToolShortcuts("runner", validateShortcuts("runner", { workspace: { m: null } }))
  expect(remapShortcutKey("runner", "workspace", { name: "m", shift: true }).name).toBe("m")
  setToolShortcuts("global", validateShortcuts("global", { workspace: { settings: "?" } }))
  expect(shortcutMatches("global", "workspace", "settings", { name: "?", shift: true })).toBe(true)
})
