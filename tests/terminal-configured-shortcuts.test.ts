import { afterEach, expect, test } from "bun:test"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../packages/core/src/keyboard/bindings"
import {
  terminalGlobalActionKey,
  terminalGlobalActionLabel,
} from "../packages/feature-terminal/src/ui/terminal-global-shortcuts"

afterEach(() => setToolShortcuts("global", getDefaultShortcuts("global")))

test("Terminal Master Key actions share the configured application shortcuts", () => {
  setToolShortcuts(
    "global",
    validateShortcuts("global", {
      workspace: {
        http: "F6",
        settings: "Ctrl+g",
        quit: null,
      },
    }),
  )
  expect(terminalGlobalActionKey({ name: "f6" })).toBe("alt+4")
  expect(terminalGlobalActionKey({ name: "g", ctrl: true })).toBe(",")
  expect(terminalGlobalActionKey({ name: "4", meta: true })).toBeNull()
  expect(terminalGlobalActionKey({ name: "q" })).toBeNull()
  expect(terminalGlobalActionLabel("alt+4", "[Alt+4] HTTP")).toBe("[F6] HTTP")
  expect(terminalGlobalActionLabel(",", "[,] Settings")).toBe("[Ctrl+G] Settings")
  expect(terminalGlobalActionLabel("q", "[Q] Exit")).toBe(" Exit")
})
