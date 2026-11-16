import { afterEach, expect, test } from "bun:test"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
  remapShortcutKey,
  formatShortcutHints,
  type ShortcutTool,
} from "../packages/core/src/keyboard/bindings"
import { EQUIVALENT_SHORTCUT_ACTIONS } from "../packages/core/src/keyboard/equivalent-actions"
import { keyForShortcut } from "../packages/core/src/keyboard/key-combination"

afterEach(() => setToolShortcuts("terminal", getDefaultShortcuts("terminal")))

for (const [tool, contexts] of Object.entries(EQUIVALENT_SHORTCUT_ACTIONS)) {
  for (const [context, groups] of Object.entries(contexts)) {
    for (const group of groups) {
      test(`${tool}/${context} accepts equivalent ${group.join("/")} bindings`, () => {
        const typedTool = tool as ShortcutTool
        const defaults = getDefaultShortcuts(typedTool)[context]!
        for (const action of group) expect(defaults[action]).toBeDefined()
        const bindings = validateShortcuts(typedTool, {
          [context]: Object.fromEntries(group.map((action) => [action, "F6"])),
        })
        for (const action of group) expect(bindings[context]?.[action]).toEqual(["F6"])
      })
    }
  }
}

test("an existing navigation alias remains valid without disabling its equivalent default", () => {
  const bindings = validateShortcuts("terminal", { sidebar: { Down: "j" } })
  setToolShortcuts("terminal", bindings)
  expect(remapShortcutKey("terminal", "sidebar", keyForShortcut("j")).name).toBe("down")
  expect(remapShortcutKey("terminal", "sidebar", keyForShortcut("Down")).name).toBe(
    "unbound-shortcut",
  )
  expect(formatShortcutHints("terminal", "sidebar", "[J/↓] Next")).toBe("[J] Next")
})

test("distinct directions and activate/cancel still conflict while modal reuse stays valid", () => {
  expect(() => validateShortcuts("terminal", { sidebar: { Up: "j" } })).toThrow("conflict")
  expect(() => validateShortcuts("terminal", { dialog: { Enter: "Esc" } })).toThrow("conflict")
  expect(() =>
    validateShortcuts("terminal", {
      sidebar: { Down: "F6", j: "F6" },
      dialog: { Esc: "F6" },
    }),
  ).not.toThrow()
  // H and Left have different roles in this context; no inferred cross-tool aliases.
  expect(() => validateShortcuts("http", { request: { h: "Left" } })).toThrow("conflict")
})
